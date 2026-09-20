import IORedis, { type Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { omnidocRedis?: Redis };

export function isValidRedisUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "redis:" || url.protocol === "rediss:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function getRedisUrl() {
  const value = process.env.REDIS_URL?.trim();
  if (!value) return undefined;
  if (!isValidRedisUrl(value)) throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL");
  return value;
}

export function getRedisClient() {
  const url = getRedisUrl();
  if (!url) return null;
  if (globalForRedis.omnidocRedis) return globalForRedis.omnidocRedis;

  const client = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy: (attempt: number) => Math.min(5_000, 250 * 2 ** Math.min(attempt, 5)),
  });
  client.on("error", (error) => {
    console.error("Redis client unavailable", error instanceof Error ? error.message : error);
  });
  globalForRedis.omnidocRedis = client;
  return client;
}

export async function publishSessionRevoked(sessionId: string) {
  try {
    const client = getRedisClient();
    if (!client) return false;
    await client.publish("omnidoc:control:session-revoked", JSON.stringify({ sessionId }));
    return true;
  } catch (error) {
    console.warn("Redis session revocation publish failed", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function closeRedisClient() {
  const client = globalForRedis.omnidocRedis;
  if (!client) return;
  globalForRedis.omnidocRedis = undefined;
  await client.quit().catch(() => client.disconnect());
}
