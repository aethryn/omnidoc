import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthErrorResponse, documentAccessWhere, getCurrentUserIdFromRequest } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);

  const { id: documentId } = await params;
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(auth.userId) },
    select: {
      images: {
        orderBy: { createdAt: "asc" },
        select: { id: true, originalName: true, fileUrl: true, mimeType: true, width: true, height: true },
      },
    },
  });

  if (!document) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  return NextResponse.json({ images: document.images }, { headers: { "Cache-Control": "private, no-store" } });
}
