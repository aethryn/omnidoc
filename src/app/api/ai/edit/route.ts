import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, verifyDocumentAccess } from "@/lib/auth";
import { decryptApiKey, ENCRYPTION_KEY_ERROR } from "@/lib/ai/credentials";
import { describeModel, extractProviderDelta, isAIProvider, providerRequest, type AIInputImage } from "@/lib/ai/providers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseAiEditResult, type AiEditScope } from "@/lib/ai/edit-operation";
import { appendProviderOutput, buildUntrustedEditContext, expectedTextForEdit, trustedAiEditInstructions } from "@/lib/ai/edit-guard";
import { createHash } from "crypto";

const encoder = new TextEncoder();
const event = (type: string, value: unknown) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
const maxImages = 4;
const maxImageBytes = 8 * 1024 * 1024;
const maxProviderOutputCharacters = 120_000;
const maxProviderOutputTokens = 16_384;

async function loadImageInputs(documentId: string, imageIds: string[]): Promise<AIInputImage[]> {
  const records = await prisma.documentImage.findMany({ where: { documentId, id: { in: imageIds } }, select: { id: true, mimeType: true, fileName: true }, orderBy: { createdAt: "asc" } });
  if (records.length !== imageIds.length) throw new Error("One or more selected images are no longer available");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Image context is not configured on the server");
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const images: AIInputImage[] = [];
  let total = 0;
  for (const record of records) {
    const { data, error } = await supabase.storage.from("document-images").download(record.fileName);
    if (error || !data) throw new Error("A selected image could not be loaded");
    const normalized = await sharp(Buffer.from(await data.arrayBuffer()), { animated: false, limitInputPixels: 16_000_000 }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    total += normalized.byteLength;
    if (total > maxImageBytes) throw new Error("Selected images are too large. Choose fewer images or smaller files.");
    images.push({ mimeType: "image/jpeg", data: normalized.toString("base64") });
  }
  return images;
}

export async function POST(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const rate = await enforceRateLimit("ai-edit", auth.userId, 10, 60_000);
  if (!rate.allowed) return Response.json({ error: "Too many AI requests. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 150_000) return Response.json({ error: "AI request is too large" }, { status: 413 });
  const body = await request.json().catch(() => ({}));
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 4_000) : "";
  const scope: AiEditScope = body.scope === "selection" || body.scope === "document" ? body.scope : "auto";
  const blocks: Array<{ id:string; index:number; text:string }> = Array.isArray(body.blocks) ? body.blocks.filter((block: unknown): block is { id:string; index:number; text:string } => Boolean(block && typeof block === "object" && typeof (block as { id?:unknown }).id === "string" && typeof (block as { index?:unknown }).index === "number" && typeof (block as { text?:unknown }).text === "string")).slice(0, 300).map((block: { id:string; index:number; text:string }) => ({ id:block.id.slice(0, 80), index:block.index, text:block.text.slice(0, 8_000) })) : [];
  const selection = body.selection && typeof body.selection === "object" ? { text:typeof body.selection.text === "string" ? body.selection.text.slice(0, 30_000) : "", from:Number(body.selection.from) || 0, to:Number(body.selection.to) || 0 } : null;
  const caret = Number.isSafeInteger(body.caret) ? body.caret : 0;
  const imageIds: string[] = Array.isArray(body.imageIds) ? Array.from(new Set<string>(body.imageIds.filter((value: unknown): value is string => typeof value === "string" && value.length <= 100))).slice(0, maxImages) : [];
  if (!instruction) return Response.json({ error: "An editing instruction is required" }, { status: 400 });
  if (scope === "selection" && (!selection?.text || selection.to <= selection.from)) return Response.json({ error: "Select text before using the selection target" }, { status: 400 });
  if (scope !== "document" && !blocks.length) return Response.json({ error: "The editor did not provide document blocks" }, { status: 400 });
  if (Array.isArray(body.imageIds) && body.imageIds.length > maxImages) return Response.json({ error: `Attach up to ${maxImages} images at a time` }, { status: 400 });
  if (imageIds.length && typeof body.documentId !== "string") return Response.json({ error: "Images can only be attached to a document" }, { status: 400 });
  if (body.documentId) {
    const access = await verifyDocumentAccess(prisma, body.documentId, auth.userId, ["owner", "admin", "editor"]);
    if (!access.authorized) return Response.json({ error: "Document access denied" }, { status: 403 });
  }
  const settings = await prisma.userSettings.findUnique({ where: { userId: auth.userId }, select: { activeAiProvider: true } });
  const provider = settings?.activeAiProvider;
  if (!isAIProvider(provider)) return Response.json({ error: "No AI API key is set. Add a Gemini or Grok key in Settings before asking Omni to edit.", code: "AI_NOT_CONFIGURED" }, { status: 409 });
  const credential = await prisma.aIProviderCredential.findUnique({ where: { userId_provider: { userId: auth.userId, provider } } });
  if (!credential) return Response.json({ error: "No AI API key is set for the selected provider. Add one in Settings before asking Omni to edit.", code: "AI_NOT_CONFIGURED" }, { status: 409 });
  const capabilities = describeModel(provider, credential.model);
  if (imageIds.length && !capabilities.imageInput) return Response.json({ error: "The selected model cannot read images. Choose Gemini 2.5 Flash or a Grok vision-capable model.", code: "MODEL_IMAGE_INPUT_UNSUPPORTED" }, { status: 400 });
  let images: AIInputImage[] = [];
  if (imageIds.length) {
    try { images = await loadImageInputs(body.documentId, imageIds); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Selected images could not be loaded" }, { status: 400 }); }
  }

  const untrustedContext = buildUntrustedEditContext({ instruction, scope, caret, selection, blocks, imageCount:images.length });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const startedAt = Date.now();
  const auditUser = createHash("sha256").update(auth.userId).digest("hex").slice(0, 12);
  const auditDocument = typeof body.documentId === "string" ? createHash("sha256").update(body.documentId).digest("hex").slice(0, 12) : null;

  const stream = new ReadableStream({
    async start(output) {
      try {
        let apiKey: string;
        try { apiKey = decryptApiKey(credential); }
        catch (error) {
          const message = error instanceof Error && error.message.includes(ENCRYPTION_KEY_ERROR)
            ? "The server encryption key is missing or invalid. Ask an administrator to configure AI_CREDENTIALS_ENCRYPTION_KEY."
            : "This saved API key can no longer be decrypted. Enter the provider key again in Settings.";
          throw new Error(message);
        }
        const upstream = await providerRequest(provider, apiKey, credential.model, { trustedInstructions:trustedAiEditInstructions, untrustedContext, signal:controller.signal, images, maxOutputTokens:maxProviderOutputTokens });
        if (!upstream.ok || !upstream.body) throw new Error(upstream.status === 401 || upstream.status === 403 ? "The saved API key was rejected" : `The provider returned ${upstream.status}`);
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let emitted = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            let delta = "";
            try { delta = extractProviderDelta(provider, JSON.parse(raw)); }
            catch { continue; /* Ignore provider keepalive events. */ }
            if (!delta || (emitted && delta === emitted)) continue;
            const next = delta.startsWith(emitted) ? delta.slice(emitted.length) : delta;
            try { emitted = appendProviderOutput(emitted, next, maxProviderOutputCharacters); }
            catch (error) { controller.abort(); throw error; }
          }
        }
        const rawResult = emitted.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const result = parseAiEditResult(JSON.parse(rawResult), new Set(blocks.map((block: { id:string }) => block.id)));
        if (scope === "selection" && result.operation !== "replace-selection") throw new Error("Omni could not produce a selection edit");
        if (scope === "document" && result.operation !== "replace-document") throw new Error("Omni could not produce a document edit");
        if (scope !== "document" && result.operation === "replace-document" && !/\b(rewrite|re-write|replace|recreate|redraft|overhaul)\b.*\b(entire|whole|complete|full|document|page)\b/i.test(instruction)) throw new Error("Omni could not produce a whole-document edit for that request");
        const expectedText = expectedTextForEdit(result, blocks, selection);
        if (expectedText == null || result.expectedText !== expectedText) throw new Error("Omni targeted text that no longer matches the request");
        console.info(JSON.stringify({ event:"ai.edit", outcome:"success", provider, model:credential.model, user:auditUser, document:auditDocument, instructionCharacters:instruction.length, contextCharacters:untrustedContext.length, images:images.length, outputCharacters:emitted.length, durationMs:Date.now()-startedAt }));
        output.enqueue(event("suggestion", result));
        output.enqueue(event("done", { ok: true }));
      } catch (error) {
        console.warn(JSON.stringify({ event:"ai.edit", outcome:"failed", provider, model:credential.model, user:auditUser, document:auditDocument, instructionCharacters:instruction.length, contextCharacters:untrustedContext.length, images:images.length, durationMs:Date.now()-startedAt, code:error instanceof SyntaxError?"INVALID_JSON":error instanceof Error?error.name:"UNKNOWN" }));
        output.enqueue(event("error", { error: error instanceof Error ? error.message : "AI request failed" }));
      } finally {
        clearTimeout(timeout);
        output.close();
      }
    },
    cancel() { controller.abort(); clearTimeout(timeout); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
