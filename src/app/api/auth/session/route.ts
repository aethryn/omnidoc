import { NextResponse } from "next/server";
import { getCurrentAuth, createAuthErrorResponse } from "@/lib/auth";

export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth.userId) return createAuthErrorResponse(auth);
  return NextResponse.json({ authenticated: true, userId: auth.userId }, { headers: { "Cache-Control": "no-store" } });
}
