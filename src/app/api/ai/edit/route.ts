import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, verifyDocumentAccess } from "@/lib/auth";
import { decryptApiKey, ENCRYPTION_KEY_ERROR } from "@/lib/ai/credentials";
import { describeModel, extractProviderDelta, isAIProvider, providerRequest, type AIInputImage } from "@/lib/ai/providers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const encoder = new TextEncoder();
const event = (type: string, value: unknown) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
const maxImages = 4;
const maxImageBytes = 8 * 1024 * 1024;

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
  const body = await request.json().catch(() => ({}));
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 4_000) : "";
  const context = typeof body.context === "string" ? body.context.slice(0, 100_000) : "";
  const selection = typeof body.selection === "string" ? body.selection.slice(0, 30_000) : "";
  const imageIds: string[] = Array.isArray(body.imageIds) ? Array.from(new Set<string>(body.imageIds.filter((value: unknown): value is string => typeof value === "string" && value.length <= 100))).slice(0, maxImages) : [];
  if (!instruction) return Response.json({ error: "An editing instruction is required" }, { status: 400 });
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

  const prompt = [
    "You are an editing assistant inside a collaborative document editor.",
    "Return only the proposed replacement or insertion text. Do not add commentary, labels, or markdown fences.",
    `Instruction: ${instruction}`,
    selection ? `Selected text:\n${selection}` : "No text is selected; continue from the document context.",
    `Document context:\n${context}`,
    images.length ? `The user attached ${images.length} document image(s). Use them as visual context.` : "No images were attached.",
  ].join("\n\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

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
        const upstream = await providerRequest(provider, apiKey, credential.model, prompt, controller.signal, images);
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
            try {
              const delta = extractProviderDelta(provider, JSON.parse(raw));
              if (!delta || (emitted && delta === emitted)) continue;
              const next = delta.startsWith(emitted) ? delta.slice(emitted.length) : delta;
              emitted += next;
              if (next) output.enqueue(event("delta", { text: next }));
            } catch { /* ignore provider keepalive events */ }
          }
        }
        output.enqueue(event("done", { ok: true }));
      } catch (error) {
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
