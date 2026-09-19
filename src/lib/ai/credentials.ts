import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
export const ENCRYPTION_KEY_ERROR = "INVALID_ENCRYPTION_KEY";

export function parseEncryptionKey(raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY): Buffer {
  if (!raw?.trim()) throw new Error(`${ENCRYPTION_KEY_ERROR}: AI_CREDENTIALS_ENCRYPTION_KEY is missing.`);
  const value = raw.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) throw new Error(`${ENCRYPTION_KEY_ERROR}: AI_CREDENTIALS_ENCRYPTION_KEY is not valid Base64.`);
  if (/[+/]/.test(value) && /[-_]/.test(value)) throw new Error(`${ENCRYPTION_KEY_ERROR}: AI_CREDENTIALS_ENCRYPTION_KEY mixes Base64 alphabets.`);
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let key: Buffer;
  try { key = Buffer.from(padded, "base64"); } catch { throw new Error(`${ENCRYPTION_KEY_ERROR}: AI_CREDENTIALS_ENCRYPTION_KEY is not valid Base64.`); }
  if (key.length !== 32) throw new Error(`${ENCRYPTION_KEY_ERROR}: AI_CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes.`);
  const canonical = key.toString("base64").replace(/=+$/, "");
  if (canonical !== normalized) throw new Error(`${ENCRYPTION_KEY_ERROR}: AI_CREDENTIALS_ENCRYPTION_KEY contains invalid Base64 padding or characters.`);
  return key;
}

export function getCredentialEncryptionStatus() {
  try { parseEncryptionKey(); return { configured: true as const, code: null }; }
  catch (error) { return { configured: false as const, code: ENCRYPTION_KEY_ERROR, message: error instanceof Error ? error.message : "Invalid encryption configuration." }; }
}

export function isCredentialEncryptionConfigured() { return getCredentialEncryptionStatus().configured; }

export function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, parseEncryptionKey(), iv);
  const encryptedKey = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return { encryptedKey, iv, authTag: cipher.getAuthTag(), keyHint: apiKey.slice(-4) };
}

export function decryptApiKey(input: { encryptedKey: Uint8Array; iv: Uint8Array; authTag: Uint8Array }) {
  const decipher = createDecipheriv(ALGORITHM, parseEncryptionKey(), Buffer.from(input.iv));
  decipher.setAuthTag(Buffer.from(input.authTag));
  return Buffer.concat([decipher.update(Buffer.from(input.encryptedKey)), decipher.final()]).toString("utf8");
}
