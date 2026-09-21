import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishSessionRevoked } from "@/lib/redis";

const redisPublishTimeoutMs = 750;

async function publishRevocationWithoutBlockingLogout(sessionId: string) {
  await Promise.race([
    publishSessionRevoked(sessionId),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), redisPublishTimeoutMs)),
  ]);
}

export async function POST() {
  const supabase = await createClient();
  const auth = await getCurrentAuth();
  if (auth.sessionId) {
    await prisma.$executeRaw`
      UPDATE "AppSession" SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP) WHERE "id" = ${auth.sessionId}
    `;
    // PostgreSQL is authoritative. Redis is an acceleration path for active
    // WebSocket connections, so a slow/reconnecting Redis client must not make
    // the browser wait to finish signing out.
    await publishRevocationWithoutBlockingLogout(auth.sessionId);
  }
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
