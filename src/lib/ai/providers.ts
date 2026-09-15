export type AIProvider = "gemini" | "xai";

export type AIModelCapabilities = { id: string; imageInput: boolean; imageOutput: boolean };
export type AIInputImage = { mimeType: "image/jpeg" | "image/png"; data: string };

export function isAIProvider(value: unknown): value is AIProvider { return value === "gemini" || value === "xai"; }

export function describeModel(provider: AIProvider, id: string): AIModelCapabilities {
  const normalized = id.replace(/^models\//, "").toLowerCase();
  const imageOutput = /image|imagen|grok-imagine/.test(normalized);
  const imageInput = provider === "gemini"
    ? /flash|pro/.test(normalized) && !imageOutput
    : /^grok/.test(normalized) && !/embedding|moderation|voice|video/.test(normalized);
  return { id, imageInput, imageOutput };
}

export async function listProviderModels(provider: AIProvider, apiKey: string): Promise<AIModelCapabilities[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = provider === "gemini"
      ? await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": apiKey }, signal: controller.signal, cache: "no-store" })
      : await fetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "The API key was rejected" : "The provider could not validate this key");
    const data = await response.json();
    const ids = provider === "gemini"
      ? (data.models ?? []).filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.some((method) => method.includes("generateContent"))).map((model: { name: string }) => model.name.replace(/^models\//, ""))
      : (data.data ?? []).map((model: { id: string }) => model.id);
    return ids.filter((id: string) => !/embedding|moderation|tts|speech|transcription|whisper|video/i.test(id)).map((id: string) => describeModel(provider, id)).filter((model: AIModelCapabilities) => !model.imageOutput || model.imageInput).slice(0, 80);
  } finally { clearTimeout(timeout); }
}

export function providerRequest(provider: AIProvider, apiKey: string, model: string, prompt: string, signal: AbortSignal, images: AIInputImage[] = []) {
  if (provider === "gemini") {
    const parts = [{ text: prompt }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))];
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}:streamGenerateContent?alt=sse`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ contents: [{ role: "user", parts }] }), signal, cache: "no-store",
    });
  }
  const input = images.length ? [{ role: "user", content: [{ type: "input_text", text: prompt }, ...images.map((image) => ({ type: "input_image", image_url: `data:${image.mimeType};base64,${image.data}` }))] }] : prompt;
  return fetch("https://api.x.ai/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, input, stream: true, store: false }), signal, cache: "no-store",
  });
}

export function extractProviderDelta(provider: AIProvider, payload: any): string {
  if (typeof payload?.delta === "string") return payload.delta;
  if (typeof payload?.delta?.text === "string") return payload.delta.text;
  if (typeof payload?.output_text === "string") return payload.output_text;
  if (provider === "gemini") {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.map((part: any) => part?.text ?? "").join("");
    if (Array.isArray(payload?.steps)) {
      const content = payload.steps.at(-1)?.content;
      if (Array.isArray(content)) return content.map((part: any) => part?.text ?? "").join("");
    }
  }
  return "";
}
