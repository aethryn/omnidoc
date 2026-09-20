import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishSessionRevoked } from "@/lib/redis";

export async function POST() {
  const supabase = await createClient();
  const auth = await getCurrentAuth();
  if (auth.sessionId) {
    await prisma.$executeRaw`
      UPDATE "AppSession" SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP) WHERE "id" = ${auth.sessionId}
    `;
    await publishSessionRevoked(auth.sessionId);
  }
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
