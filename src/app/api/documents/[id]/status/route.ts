import { NextRequest, NextResponse } from "next/server";

import { createAuthErrorResponse, getCurrentUserIdFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statuses = new Set(["WORKING_DRAFT", "COMPLETE"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !statuses.has(body.status)) return NextResponse.json({ error: "Choose Working Draft or Complete" }, { status: 400 });

  const owned = await prisma.document.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Only the document owner can change its status" }, { status: 403 });

  const document = await prisma.document.update({ where: { id }, data: { status: body.status }, select: { id: true, status: true } });
  await prisma.documentActivity.create({ data: { documentId: id, userId: auth.userId, action: "status_changed", description: body.status === "COMPLETE" ? "Marked complete" : "Returned to working draft" } });
  return NextResponse.json(document);
}

