import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("redirect", `/api/share/${encodeURIComponent(token)}/accept`);
    return NextResponse.redirect(url);
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [userRate, tokenRate] = await Promise.all([
    enforceRateLimit("share-accept-user", String(userId), 20, 60 * 60_000),
    enforceRateLimit("share-accept-token", tokenHash, 50, 60 * 60_000),
  ]);
  const limited = !userRate.allowed ? userRate : !tokenRate.allowed ? tokenRate : null;
  if (limited) return rateLimitedResponse(limited.retryAfter, "Too many invitation attempts. Try again later.");
  const share = await prisma.documentShare.findFirst({ where: { shareToken: tokenHash, isActive: true } });
  if (!share) return NextResponse.json({ error: "This share link is invalid or revoked" }, { status: 404 });
  if (share.expiresAt && share.expiresAt <= new Date()) return NextResponse.json({error:"This share link has expired"},{status:410});
  if (share.maxUses !== null && share.useCount >= share.maxUses) return NextResponse.json({error:"This share link has reached its use limit"},{status:410});
  const profile=await prisma.user.findUnique({where:{id:userId},select:{id:true}});if(!profile)return NextResponse.redirect(new URL(`/auth/callback?next=${encodeURIComponent(`/api/share/${token}/accept`)}`,request.url));
  const role=share.permissions.includes("viewer")?"viewer":"editor";
  try{await prisma.$transaction(async(tx: Prisma.TransactionClient)=>{
    const consumed=await tx.documentShare.updateMany({where:{id:share.id,isActive:true,useCount:share.useCount},data:{useCount:{increment:1}}});
    if(!consumed.count)throw new Error("LINK_CONSUMED");
    await tx.documentCollaborators.upsert({where:{documentId_userId:{documentId:share.documentId,userId}},update:{role,acceptedAt:new Date(),permissions:share.permissions,accessExpiresAt:share.expiresAt},create:{documentId:share.documentId,userId,role,permissions:share.permissions,acceptedAt:new Date(),accessExpiresAt:share.expiresAt}});
  });}catch{return NextResponse.json({error:"This share link was just used or revoked. Try again."},{status:409});}
  return NextResponse.redirect(new URL(`/document/${share.documentId}`, request.url));
}
