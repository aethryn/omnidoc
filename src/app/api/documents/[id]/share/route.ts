import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  const document = await prisma.document.findFirst({ where:{ id,userId:auth.userId }, select:{id:true} });
  if(!document)return NextResponse.json({error:"Only the owner can manage links"},{status:403});
  const links=await prisma.documentShare.findMany({where:{documentId:id},orderBy:{createdAt:"desc"},select:{id:true,permissions:true,expiresAt:true,maxUses:true,useCount:true,createdAt:true,isActive:true}});
  return NextResponse.json(links.map((link: typeof links[number])=>({...link,role:link.permissions.includes("viewer")?"viewer":"editor"})));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  const document = await prisma.document.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!document) return NextResponse.json({ error: "Only the owner can share this document" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const role = body.role === "viewer" ? "viewer" : "editor";
  const expiresInDays = Number.isFinite(Number(body.expiresInDays)) ? Math.min(90, Math.max(1, Number(body.expiresInDays))) : 7;
  const maxUses = body.maxUses === null || body.maxUses === "" ? null : Math.min(100, Math.max(1, Number(body.maxUses) || 1));
  const rawToken = randomBytes(32).toString("base64url");
  await prisma.documentShare.create({ data: { documentId: id, shareToken: hash(rawToken), permissions: [role], createdBy: auth.userId, isActive: true, expiresAt:new Date(Date.now()+expiresInDays*86_400_000), maxUses } });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/join/${rawToken}`, role });
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=await getCurrentUserIdFromRequest(request);if(!auth.userId)return createAuthErrorResponse(auth);
  const {id}=await params;const body=await request.json().catch(()=>({}));
  const owner=await prisma.document.findFirst({where:{id,userId:auth.userId},select:{id:true}});if(!owner)return NextResponse.json({error:"Only the owner can revoke links"},{status:403});
  if(typeof body.shareId!=="string")return NextResponse.json({error:"A share link is required"},{status:400});
  await prisma.documentShare.updateMany({where:{id:body.shareId,documentId:id},data:{isActive:false}});
  return NextResponse.json({ok:true});
}
