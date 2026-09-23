import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createAuthErrorResponse, getCurrentUserIdFromRequest } from "@/lib/auth";
import { deriveDocumentPreview, slugifyDocumentTitle } from "@/lib/document-content";
import { prisma } from "@/lib/prisma";
import { documentRevisionHash, publicationUrl } from "@/lib/publication";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

async function ownerDocument(request: NextRequest, id: string) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return { auth, document: null };
  const document = await prisma.document.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, title: true, content: true, status: true, updatedAt: true, publication: true },
  });
  return { auth, document };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, document } = await ownerDocument(request, id);
  if (!auth.userId) return createAuthErrorResponse(auth);
  if (!document) return NextResponse.json({ error: "Only the document owner can manage publishing" }, { status: 403 });
  const publication = document.publication;
  return NextResponse.json({
    status: document.status,
    publication: publication ? {
      id: publication.id,
      slug: publication.slug,
      isActive: publication.isActive,
      publishedAt: publication.publishedAt,
      updatedAt: publication.updatedAt,
      url: publicationUrl(request.nextUrl.origin, publication.id, publication.title),
      hasUnpublishedChanges: publication.revisionHash !== documentRevisionHash(document.title, document.content),
    } : null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, document } = await ownerDocument(request, id);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("publication-mutation", auth.userId, 10, 10 * 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfter, "Too many publication changes. Try again later.");
  if (!document) return NextResponse.json({ error: "Only the document owner can publish" }, { status: 403 });
  if (document.status !== "COMPLETE") return NextResponse.json({ error: "Mark the document Complete before publishing" }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { title?: unknown; content?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) || "Untitled document" : document.title;
  const content = document.content;
  if (content.length > 5_000_000) return NextResponse.json({ error: "Document is too large to publish" }, { status: 413 });
  const preview = deriveDocumentPreview(content);
  const slug = slugifyDocumentTitle(title);
  const revisionHash = documentRevisionHash(title, content);
  const now = new Date();

  const publication = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.document.update({ where: { id }, data: { title, content, ...preview, lastEditedAt: now } });
    return tx.documentPublication.upsert({
      where: { documentId: id },
      create: { documentId: id, slug, title, content, excerpt: preview.previewText, revisionHash, isActive: true, publishedAt: now },
      update: { slug, title, content, excerpt: preview.previewText, revisionHash, isActive: true, publishedAt: now },
    });
  });
  await prisma.documentActivity.create({ data: { documentId: id, userId: auth.userId, action: document.publication ? "republished" : "published", description: document.publication ? "Published a new snapshot" : "Published document" } });
  revalidatePath(`/p/${publication.id}/${publication.slug}`);
  revalidateTag(`publication:${publication.id}`, { expire:0 });
  return NextResponse.json({ id: publication.id, slug: publication.slug, publishedAt: publication.publishedAt, url: publicationUrl(request.nextUrl.origin, publication.id, publication.title), hasUnpublishedChanges: false });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, document } = await ownerDocument(request, id);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("publication-mutation", auth.userId, 10, 10 * 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfter, "Too many publication changes. Try again later.");
  if (!document) return NextResponse.json({ error: "Only the document owner can unpublish" }, { status: 403 });
  if (!document.publication) return NextResponse.json({ error: "Document has not been published" }, { status: 404 });
  await prisma.documentPublication.update({ where: { documentId: id }, data: { isActive: false } });
  await prisma.documentActivity.create({ data: { documentId: id, userId: auth.userId, action: "unpublished", description: "Removed the public page" } });
  revalidatePath(`/p/${document.publication.id}/${document.publication.slug}`);
  revalidateTag(`publication:${document.publication.id}`, { expire:0 });
  return new NextResponse(null, { status: 204 });
}
