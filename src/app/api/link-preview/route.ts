import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { normalizePreviewUrl, previewUrlHash, readLinkPreview } from "@/lib/link-preview";

export async function GET(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw || raw.length > 4_000) return NextResponse.json({ error: "A valid URL is required", code: "INVALID_URL" }, { status: 400 });
  let url: URL;
  try { url = normalizePreviewUrl(raw, request.nextUrl.origin); } catch { return NextResponse.json({ error: "Only HTTP(S) links can be previewed", code: "INVALID_URL" }, { status: 400 }); }
  const hash = previewUrlHash(url.href);
  const cached = await prisma.linkPreview.findUnique({ where: { urlHash: hash } });
  if (cached && cached.expiresAt > new Date()) return NextResponse.json({ ...cached, imageUrl: cached.imageUrl ? `/api/link-preview/media?url=${encodeURIComponent(cached.imageUrl)}` : null, faviconUrl: cached.faviconUrl ? `/api/link-preview/media?url=${encodeURIComponent(cached.faviconUrl)}` : null });
  const documentMatch = url.pathname.match(/^\/document\/([^/]+)$/);
  if (url.origin === request.nextUrl.origin && documentMatch) {
    const document = await prisma.document.findFirst({ where: { id: documentMatch[1], OR: [{ userId: auth.userId }, { collaborators: { some: { userId: auth.userId, acceptedAt: { not: null } } } }] }, select: { title: true, previewText: true, previewImageUrl: true } });
    if (!document) return NextResponse.json({ error: "Link preview unavailable", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ url: url.href, title: document.title, description: document.previewText || null, siteName: "Omnidoc", faviconUrl: null, imageUrl: document.previewImageUrl || null, isAvailable: true });
  }
  try {
    const preview = await readLinkPreview(url);
    const stored = await prisma.linkPreview.upsert({ where: { urlHash: hash }, create: { urlHash: hash, ...preview, fetchedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }, update: { ...preview, fetchedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), isAvailable: true } });
    return NextResponse.json({ ...stored, imageUrl: stored.imageUrl ? `/api/link-preview/media?url=${encodeURIComponent(stored.imageUrl)}` : null, faviconUrl: stored.faviconUrl ? `/api/link-preview/media?url=${encodeURIComponent(stored.faviconUrl)}` : null });
  } catch {
    await prisma.linkPreview.upsert({ where: { urlHash: hash }, create: { urlHash: hash, url: url.href, isAvailable: false, fetchedAt: new Date(), expiresAt: new Date(Date.now() + 900_000) }, update: { isAvailable: false, fetchedAt: new Date(), expiresAt: new Date(Date.now() + 900_000) } }).catch(() => undefined);
    return NextResponse.json({ url: url.href, title: null, description: null, siteName: url.hostname, faviconUrl: null, imageUrl: null, isAvailable: false });
  }
}
