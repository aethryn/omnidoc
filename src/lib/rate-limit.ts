import { prisma } from "@/lib/prisma";

export async function enforceRateLimit(scope: string, key: string, limit: number, windowMs: number) {
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
