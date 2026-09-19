import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorWhere, documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, commentId } = await params;
  const comment = await prisma.documentComment.findFirst({ where: { id: commentId, documentId: id, deletedAt: null }, select: { id: true, userId: true } });
  const document = await prisma.document.findFirst({ where: { id, ...documentAccessWhere(auth.userId) }, select: { userId: true } });
  const collaborator = await prisma.documentCollaborators.findFirst({ where: { documentId: id, ...activeCollaboratorWhere(auth.userId) }, select: { role: true } });
  const body = await request.json().catch(() => ({}));
  const resolved = typeof body.resolved === "boolean" ? body.resolved : typeof body.isResolved === "boolean" ? body.isResolved : undefined;
  if (typeof resolved === "boolean") {
    if (!comment || !document) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    if (document.userId !== auth.userId && !["editor", "admin"].includes(collaborator?.role || "")) return NextResponse.json({ error: "Only editors can resolve comments" }, { status: 403 });
    return NextResponse.json(await prisma.documentComment.update({ where: { id: commentId }, data: { isResolved: resolved, resolvedAt: resolved ? new Date() : null, resolvedBy: resolved ? auth.userId : null } }));
  }
  if (!comment || !document || (comment.userId !== auth.userId && document.userId !== auth.userId)) return NextResponse.json({ error: "Comment access denied" }, { status: 403 });
  if (typeof body.content === "string") return NextResponse.json(await prisma.documentComment.update({ where: { id: commentId }, data: { content: body.content.trim().slice(0, 10_000) } }));
  return NextResponse.json({ error: "No supported comment change supplied" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, commentId } = await params;
  const comment = await prisma.documentComment.findFirst({ where: { id: commentId, documentId: id, deletedAt: null }, select: { id: true, userId: true } });
  const document = await prisma.document.findFirst({ where: { id, ...documentAccessWhere(auth.userId) }, select: { userId: true } });
  if (!comment || !document || (comment.userId !== auth.userId && document.userId !== auth.userId)) return NextResponse.json({ error: "Comment access denied" }, { status: 403 });
  await prisma.documentComment.update({ where: { id: commentId }, data: { deletedAt: new Date(), content: "[deleted]" } });
  return NextResponse.json({ ok: true });
}
