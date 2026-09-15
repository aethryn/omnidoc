import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { encryptApiKey, getCredentialEncryptionStatus } from "@/lib/ai/credentials";
import { isAIProvider, listProviderModels } from "@/lib/ai/providers";

export async function GET(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const [settings, credentials] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: auth.userId }, select: { activeAiProvider: true } }),
    prisma.aIProviderCredential.findMany({ where: { userId: auth.userId }, select: { provider: true, keyHint: true, model: true, updatedAt: true } }),
  ]);
  const encryption = getCredentialEncryptionStatus();
  return NextResponse.json({ activeProvider: settings?.activeAiProvider ?? null, encryptionConfigured: encryption.configured, encryptionCode: encryption.configured ? null : encryption.code, providers: credentials.map((item: typeof credentials[number]) => ({ ...item, configured: true })) });
}

export async function PUT(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const body = await request.json().catch(() => ({}));
  if (!isAIProvider(body.provider) || typeof body.apiKey !== "string" || body.apiKey.trim().length < 10) {
    return NextResponse.json({ error: "Choose a provider and enter a valid API key" }, { status: 400 });
  }
  const encryption = getCredentialEncryptionStatus();
  if (!encryption.configured) return NextResponse.json({ error: "The server encryption key is missing or invalid. Set AI_CREDENTIALS_ENCRYPTION_KEY to a valid Base64 value containing exactly 32 decoded bytes.", code: encryption.code }, { status: 503 });
  try {
    const apiKey = body.apiKey.trim();
    const models = await listProviderModels(body.provider, apiKey);
    if (!models.length) return NextResponse.json({ error: "No compatible text models were found" }, { status: 400 });
    const requestedModel = typeof body.model === "string" ? body.model : "";
    const model = models.includes(requestedModel) ? requestedModel : models[0];
    const encrypted = encryptApiKey(apiKey);
    await prisma.$transaction([
      prisma.aIProviderCredential.upsert({
        where: { userId_provider: { userId: auth.userId, provider: body.provider } },
        update: { ...encrypted, model },
        create: { userId: auth.userId, provider: body.provider, model, ...encrypted },
      }),
      prisma.userSettings.upsert({
        where: { userId: auth.userId },
        update: { activeAiProvider: body.provider },
        create: { userId: auth.userId, activeAiProvider: body.provider },
      }),
    ]);
    return NextResponse.json({ provider: body.provider, configured: true, keyHint: encrypted.keyHint, model, models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this provider";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const provider = request.nextUrl.searchParams.get("provider");
  if (!isAIProvider(provider)) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  await prisma.aIProviderCredential.deleteMany({ where: { userId: auth.userId, provider } });
  const settings = await prisma.userSettings.findUnique({ where: { userId: auth.userId }, select: { activeAiProvider: true } });
  if (settings?.activeAiProvider === provider) await prisma.userSettings.update({ where: { userId: auth.userId }, data: { activeAiProvider: null } });
  return NextResponse.json({ ok: true });
}
