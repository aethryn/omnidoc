import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("redirect", `/api/share/${encodeURIComponent(token)}/accept`);
    return NextResponse.redirect(url);
  }
  const share = await (prisma.documentShare as any).findFirst({ where: { shareToken: createHash("sha256").update(token).digest("hex"), isActive: true } });
  if (!share) return NextResponse.json({ error: "This share link is invalid or revoked" }, { status: 404 });
  await prisma.user.upsert({ where: { id: user.id }, update: { email: user.email || "" }, create: { id: user.id, email: user.email || `${user.id}@supabase.local`, name: user.user_metadata?.full_name || "User", avatar: user.user_metadata?.avatar_url || "vibrent_2.png" } });
  await prisma.documentCollaborators.upsert({
    where: { documentId_userId: { documentId: share.documentId, userId: user.id } },
    update: { role: share.permissions.includes("viewer") ? "viewer" : "editor", acceptedAt: new Date() },
    create: { documentId: share.documentId, userId: user.id, role: share.permissions.includes("viewer") ? "viewer" : "editor", permissions: share.permissions, acceptedAt: new Date() },
  });
  return NextResponse.redirect(new URL(`/document/${share.documentId}`, request.url));
}
