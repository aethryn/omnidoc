export type AIProvider = "gemini" | "xai";

export function isAIProvider(value: unknown): value is AIProvider {
  return value === "gemini" || value === "xai";
}

export async function listProviderModels(provider: AIProvider, apiKey: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = provider === "gemini"
      ? await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": apiKey }, signal: controller.signal, cache: "no-store" })
      : await fetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "The API key was rejected" : "The provider could not validate this key");
    const data = await response.json();
    const models = provider === "gemini"
      ? (data.models ?? []).filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.some((method) => method.includes("generateContent"))).map((model: { name: string }) => model.name.replace(/^models\//, ""))
      : (data.data ?? []).map((model: { id: string }) => model.id);
    return models.filter((model: string) => !/image|video|audio|embedding/i.test(model)).slice(0, 80);
  } finally {
    clearTimeout(timeout);
  }
}

export function providerRequest(provider: AIProvider, apiKey: string, model: string, prompt: string, signal: AbortSignal) {
  if (provider === "gemini") {
    return fetch("https://generativelanguage.googleapis.com/v1/interactions?alt=sse", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ model, input: prompt, stream: true, store: false }),
      signal,
      cache: "no-store",
    });
  }
  return fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: prompt, stream: true, store: false }),
    signal,
    cache: "no-store",
  });
}

export function extractProviderDelta(provider: AIProvider, payload: any): string {
  if (typeof payload?.delta === "string") return payload.delta;
  if (typeof payload?.delta?.text === "string") return payload.delta.text;
  if (typeof payload?.output_text === "string") return payload.output_text;
  if (provider === "gemini" && Array.isArray(payload?.steps)) {
    const content = payload.steps.at(-1)?.content;
    if (Array.isArray(content)) return content.map((part: any) => part?.text ?? "").join("");
  }
  return "";
}
