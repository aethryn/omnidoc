import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  if (!raw && process.env.NODE_ENV !== "production") {
    const developmentSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DATABASE_URL;
    if (developmentSecret) return createHash("sha256").update(`omnidoc-development-ai:${developmentSecret}`).digest();
  }
  if (!raw) throw new Error("AI credential encryption is not configured on this server. Set AI_CREDENTIALS_ENCRYPTION_KEY.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function isCredentialEncryptionConfigured() {
  return Boolean(process.env.AI_CREDENTIALS_ENCRYPTION_KEY || (process.env.NODE_ENV !== "production" && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DATABASE_URL)));
}

export function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encryptedKey = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return { encryptedKey, iv, authTag: cipher.getAuthTag(), keyHint: apiKey.slice(-4) };
}

export function decryptApiKey(input: { encryptedKey: Uint8Array; iv: Uint8Array; authTag: Uint8Array }) {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(input.iv));
  decipher.setAuthTag(Buffer.from(input.authTag));
  return Buffer.concat([decipher.update(Buffer.from(input.encryptedKey)), decipher.final()]).toString("utf8");
}
