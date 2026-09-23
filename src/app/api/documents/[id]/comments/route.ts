import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

async function member(documentId: string, userId: string) {
  return prisma.document.findFirst({ where: { id: documentId, ...documentAccessWhere(userId) }, select: { id: true, userId: true, allowComments: true } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  if (!await member(id, auth.userId)) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  const filter = request.nextUrl.searchParams.get("filter") || "open";
  const threads = await prisma.documentComment.findMany({ where: { documentId: id, parentId: null, deletedAt: null, ...(filter === "resolved" ? { isResolved: true } : filter === "open" ? { isResolved: false } : {}) }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, avatar: true } }, replies: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, avatar: true } } } } } });
  return NextResponse.json(threads.map((thread: any) => ({ ...thread, createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(), resolvedAt: thread.resolvedAt?.toISOString() || null, replies: thread.replies.map((reply: any) => ({ ...reply, createdAt: reply.createdAt.toISOString(), updatedAt: reply.updatedAt.toISOString() })) })));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("comment-create", auth.userId, 30, 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfter, "Too many comments. Try again shortly.");
  const { id } = await params;
  const document = await member(id, auth.userId);
  if (!document) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  if (!document.allowComments) return NextResponse.json({ error: "Comments are disabled for this document" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 10_000) : "";
  if (!content) return NextResponse.json({ error: "Comment text is required" }, { status: 400 });
  const anchorType = body.anchorType === "inline" ? "inline" : "general";
  const comment = await prisma.documentComment.create({ data: { documentId: id, userId: auth.userId, content, anchorType, anchorText: typeof body.anchorText === "string" ? body.anchorText.slice(0, 2_000) : null }, include: { user: { select: { id: true, name: true, avatar: true } } } });
  await prisma.documentActivity.create({ data: { documentId: id, userId: auth.userId, action: "commented", description: anchorType === "inline" ? "Added an inline comment" : "Added a comment" } });
  return NextResponse.json(comment, { status: 201 });
}
