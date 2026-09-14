import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  const document = await prisma.document.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!document) return NextResponse.json({ error: "Only the owner can share this document" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const role = body.role === "viewer" ? "viewer" : "editor";
  const rawToken = randomBytes(32).toString("base64url");
  await (prisma.documentShare as any).create({ data: { documentId: id, shareToken: hash(rawToken), permissions: [role], createdBy: auth.userId, isActive: true } });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/join/${rawToken}`, role });
}
