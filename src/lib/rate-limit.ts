import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export function rateLimitWindow(now: number, windowMs: number) {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  return { windowStart, retryAfter:Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)) };
}

export async function enforceRateLimit(scope: string, key: string, limit: number, windowMs: number) {
  const { windowStart, retryAfter } = rateLimitWindow(Date.now(), windowMs);
  const id = `${scope}:${key}:${windowStart.getTime()}`;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("id", "count", "windowStart")
    VALUES (${id}, 1, ${windowStart})
    ON CONFLICT ("id") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;
  return { allowed: Number(rows[0]?.count || 0) <= limit, retryAfter };
}

export function rateLimitedResponse(retryAfter: number, error = "Too many requests") {
  return NextResponse.json({ error, code:"RATE_LIMITED" }, { status:429, headers:{ "Retry-After":String(retryAfter) } });
}
