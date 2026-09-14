import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id, shareId } = await params;
  const link = await (prisma.documentShare as any).findFirst({ where: { id: shareId, documentId: id, createdBy: auth.userId } });
  if (!link) return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  await (prisma.documentShare as any).update({ where: { id: shareId }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
