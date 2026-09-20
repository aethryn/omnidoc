import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

export const redisRateLimitScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return { count, redis.call("PTTL", KEYS[1]) }
`;

type RedisRateLimitClient = {
  eval(script: string, numberOfKeys: number, key: string, windowMs: string): Promise<unknown>;
};

async function enforcePostgresRateLimit(scope: string, key: string, limit: number, windowMs: number) {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const id = `${scope}:${key}:${windowStart.getTime()}`;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("id", "count", "windowStart")
    VALUES (${id}, 1, ${windowStart})
    ON CONFLICT ("id") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;
  return { allowed: Number(rows[0]?.count || 0) <= limit, retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000)) };
}

export async function enforceRedisRateLimit(redis: RedisRateLimitClient, scope: string, key: string, limit: number, windowMs: number) {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const redisKey = `omnidoc:ratelimit:${scope}:${key}:${windowStart.getTime()}`;
  const result = await redis.eval(redisRateLimitScript, 1, redisKey, String(windowMs)) as [number, number];
  const count = Number(result[0] || 0);
  const remainingMs = Number(result[1] || windowMs);
  return { allowed: count <= limit, retryAfter: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

export async function enforceRateLimit(scope: string, key: string, limit: number, windowMs: number) {
  const redis = getRedisClient();
  if (!redis) return enforcePostgresRateLimit(scope, key, limit, windowMs);

  try {
    return await enforceRedisRateLimit(redis, scope, key, limit, windowMs);
  } catch (error) {
    console.warn("Redis rate limit unavailable; using PostgreSQL fallback", error instanceof Error ? error.message : error);
    return enforcePostgresRateLimit(scope, key, limit, windowMs);
  }
}
