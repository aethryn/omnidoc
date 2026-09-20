import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { normalizePreviewUrl, readPreviewMedia } from "@/lib/link-preview";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("link-preview-media", auth.userId, 60, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many preview media requests", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  try {
    const { buffer, contentType } = await readPreviewMedia(normalizePreviewUrl(raw));
    return new NextResponse(buffer, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" } });
  } catch { return NextResponse.json({ error: "Preview media unavailable" }, { status: 404 }); }
}
