import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, commentId } = await params;
  const member = await prisma.document.findFirst({ where: { id, allowComments: true, ...documentAccessWhere(auth.userId) }, select: { id: true } });
  const parent = await prisma.documentComment.findFirst({ where: { id: commentId, documentId: id, parentId: null, deletedAt: null }, select: { id: true } });
  if (!member || !parent) return NextResponse.json({ error: "Comment thread not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 10_000) : "";
  if (!content) return NextResponse.json({ error: "Reply text is required" }, { status: 400 });
  const reply = await prisma.documentComment.create({ data: { documentId: id, userId: auth.userId, parentId: parent.id, content, anchorType: "general" }, include: { user: { select: { id: true, name: true, avatar: true } } } });
  return NextResponse.json(reply, { status: 201 });
}
