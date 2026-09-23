import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorWhere, documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { allocateDocumentVersionNumber, documentContentHash } from "@/lib/document-version";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

async function membership(documentId: string, userId: string) {
  return prisma.document.findFirst({ where: { id: documentId, ...documentAccessWhere(userId) }, select: { id: true, userId: true, title: true, content: true } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  if (!await membership(id, auth.userId)) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50));
  const versions = await prisma.documentVersion.findMany({ where: { documentId: id }, orderBy: { versionNumber: "desc" }, take: limit, select: { id: true, title: true, versionNumber: true, changeDescription: true, source: true, contributors: true, createdAt: true, createdBy: true } });
  const userIds = Array.from(new Set(versions.flatMap((version: any) => [version.createdBy, ...version.contributors])));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatar: true } });
  const people = new Map(users.map((user: any) => [user.id, user]));
  return NextResponse.json(versions.map((version: any) => ({ ...version, createdAt: version.createdAt.toISOString(), author: people.get(version.createdBy) || null, contributors: version.contributors.map((id: string) => people.get(id)).filter(Boolean) })));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("version-create", auth.userId, 10, 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfter, "Too many manual versions. Try again shortly.");
  const { id } = await params;
  const document = await membership(id, auth.userId);
  if (!document) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  const collaborator = await prisma.documentCollaborators.findFirst({ where: { documentId: id, ...activeCollaboratorWhere(auth.userId) }, select: { role: true } });
  if (document.userId !== auth.userId && !["editor", "admin"].includes(collaborator?.role || "")) return NextResponse.json({ error: "Only editors can create versions" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : document.content;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) || "Untitled document" : document.title;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 200) || null : null;
  const contentHash = documentContentHash(title, content);
  const existing = await prisma.documentVersion.findUnique({ where: { documentId_contentHash: { documentId: id, contentHash } }, select: { id: true, versionNumber: true } });
  if (existing) return NextResponse.json({ ...existing, deduplicated: true });
  const versionNumber = await allocateDocumentVersionNumber(prisma, id);
  let version;
  try {
    version = await prisma.documentVersion.create({ data: { documentId: id, title, content, versionNumber, changeDescription: description, source: "manual", contentHash, contributors: [auth.userId], createdBy: auth.userId } });
  } catch (error) {
    const duplicate = await prisma.documentVersion.findUnique({ where: { documentId_contentHash: { documentId: id, contentHash } }, select: { id: true, versionNumber: true } });
    if (duplicate) return NextResponse.json({ ...duplicate, deduplicated: true });
    throw error;
  }
  return NextResponse.json({ id: version.id, versionNumber: version.versionNumber, createdAt: version.createdAt.toISOString() }, { status: 201 });
}
