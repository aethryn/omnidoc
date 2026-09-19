import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorWhere, documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

async function access(documentId: string, userId: string) {
  return prisma.document.findFirst({ where: { id: documentId, ...documentAccessWhere(userId) }, select: { id: true, userId: true, title: true, content: true } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, versionId } = await params;
  if (!await access(id, auth.userId)) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  const version = await prisma.documentVersion.findFirst({ where: { id: versionId, documentId: id }, select: { id: true, title: true, content: true, versionNumber: true, changeDescription: true, source: true, contributors: true, createdAt: true, createdBy: true } });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  const author = await prisma.user.findUnique({ where: { id: version.createdBy }, select: { id: true, name: true, avatar: true } });
  return NextResponse.json({ ...version, createdAt: version.createdAt.toISOString(), author });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, versionId } = await params;
  const document = await access(id, auth.userId);
  if (!document) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  const collaborator = await prisma.documentCollaborators.findFirst({ where: { documentId: id, ...activeCollaboratorWhere(auth.userId) }, select: { role: true } });
  if (document.userId !== auth.userId && !["editor", "admin"].includes(collaborator?.role || "")) return NextResponse.json({ error: "Only editors can restore versions" }, { status: 403 });
  const version = await prisma.documentVersion.findFirst({ where: { id: versionId, documentId: id }, select: { id: true, title: true, content: true, versionNumber: true } });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ version, restoreAsCollaborativeEdit: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, versionId } = await params;
  const document = await prisma.document.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!document) return NextResponse.json({ error: "Only the document owner can delete versions" }, { status: 403 });
  const removed = await prisma.documentVersion.deleteMany({ where: { id: versionId, documentId: id } });
  if (!removed.count) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  await prisma.documentActivity.create({ data: { documentId: id, userId: auth.userId, action: "version_deleted", description: "Deleted a saved version", metadata: { versionId } } });
  return NextResponse.json({ ok: true });
}
