import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, verifyDocumentAccess } from "@/lib/auth";
import { decryptApiKey } from "@/lib/ai/credentials";
import { extractProviderDelta, isAIProvider, providerRequest } from "@/lib/ai/providers";

const encoder = new TextEncoder();
const event = (type: string, value: unknown) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);

export async function POST(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 4_000) : "";
  const context = typeof body.context === "string" ? body.context.slice(0, 100_000) : "";
  const selection = typeof body.selection === "string" ? body.selection.slice(0, 30_000) : "";
  if (!instruction) return Response.json({ error: "An editing instruction is required" }, { status: 400 });
  if (body.documentId) {
    const access = await verifyDocumentAccess(prisma, body.documentId, auth.userId, ["owner", "admin", "editor"]);
    if (!access.authorized) return Response.json({ error: "Document access denied" }, { status: 403 });
  }
  const settings = await prisma.userSettings.findUnique({ where: { userId: auth.userId }, select: { activeAiProvider: true } });
  const provider = settings?.activeAiProvider;
  if (!isAIProvider(provider)) return Response.json({ error: "No AI API key is set. Add a Gemini or Grok key in Settings before asking Omni to edit.", code: "AI_NOT_CONFIGURED" }, { status: 409 });
  const credential = await prisma.aIProviderCredential.findUnique({ where: { userId_provider: { userId: auth.userId, provider } } });
  if (!credential) return Response.json({ error: "No AI API key is set for the selected provider. Add one in Settings before asking Omni to edit.", code: "AI_NOT_CONFIGURED" }, { status: 409 });

  const prompt = [
    "You are an editing assistant inside a collaborative document editor.",
    "Return only the proposed replacement or insertion text. Do not add commentary, labels, or markdown fences.",
    `Instruction: ${instruction}`,
    selection ? `Selected text:\n${selection}` : "No text is selected; continue from the document context.",
    `Document context:\n${context}`,
  ].join("\n\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  const stream = new ReadableStream({
    async start(output) {
      try {
        const upstream = await providerRequest(provider, decryptApiKey(credential), credential.model, prompt, controller.signal);
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
