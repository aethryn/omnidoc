import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorConstraint, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hasRealtimeCollaboration } from "@/lib/collaboration-eligibility";
import { contentToYDoc } from "@/lib/document-yjs";
import * as Y from "yjs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("share-link", auth.userId, 20, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many share-link requests", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const { id } = await params;
  const document = await prisma.document.findFirst({ where:{ id,userId:auth.userId }, select:{id:true} });
  if(!document)return NextResponse.json({error:"Only the owner can manage links"},{status:403});
  const links=await prisma.documentShare.findMany({where:{documentId:id},orderBy:{createdAt:"desc"},select:{id:true,permissions:true,expiresAt:true,maxUses:true,useCount:true,createdAt:true,isActive:true}});
  return NextResponse.json(links.map((link: typeof links[number])=>({...link,role:link.permissions.includes("viewer")?"viewer":"editor"})));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const userId = auth.userId;
  const rate = await enforceRateLimit("share-link-create", auth.userId, 20, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many share-link requests", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const role = body.role === "viewer" ? "viewer" : "editor";
  const expiresInMinutes = Number(body.expiresInMinutes);
  const allowedExpiryWindows = new Set([15, 30, 60, 1_440, 10_080]);
  if (!allowedExpiryWindows.has(expiresInMinutes)) return NextResponse.json({ error: "Choose a 15 minute, 30 minute, 60 minute, 24 hour, or 7 day invitation window" }, { status: 400 });
  const maxUses = body.maxUses === null || body.maxUses === "" ? null : Math.min(100, Math.max(1, Number(body.maxUses) || 1));
  const rawToken = randomBytes(32).toString("base64url");
  let collaboration;
  try {
    collaboration = await prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where:{ id, userId },
        select:{ id:true, content:true, yjsState:true, yjsEpoch:true, shares:{where:{isActive:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true},take:1},collaborators:{where:activeCollaboratorConstraint(),select:{id:true},take:1} },
      });
      if (!document) return null;
      const transitioningToRealtime = !hasRealtimeCollaboration(document);
      const initializesCanonicalState = transitioningToRealtime || !document.yjsState;
      const yjsState = initializesCanonicalState
        ? Buffer.from(Y.encodeStateAsUpdate(contentToYDoc(document.content)))
        : Buffer.from(document.yjsState!);
      let yjsEpoch = document.yjsEpoch;
      if (initializesCanonicalState) {
        const initialized = await tx.document.updateMany({ where:{ id, yjsEpoch:document.yjsEpoch }, data:{ yjsState, yjsEpoch:{ increment:1 } } });
        if (!initialized.count) throw new Error("DOCUMENT_CHANGED");
        yjsEpoch += 1;
      }
      await tx.documentShare.create({ data: { documentId: id, shareToken: hash(rawToken), permissions: [role], createdBy:userId, isActive: true, expiresAt:new Date(Date.now() + expiresInMinutes * 60_000), maxUses } });
      return { yjsState:yjsState.toString("base64"), yjsEpoch };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DOCUMENT_CHANGED") return NextResponse.json({ error:"The document changed while sharing. Try again.", code:"DOCUMENT_CHANGED" }, { status:409 });
    throw error;
  }
  if (!collaboration) return NextResponse.json({ error: "Only the owner can share this document" }, { status: 403 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/join/${rawToken}`, role, ...collaboration });
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=await getCurrentUserIdFromRequest(request);if(!auth.userId)return createAuthErrorResponse(auth);
  const {id}=await params;const body=await request.json().catch(()=>({}));
  const owner=await prisma.document.findFirst({where:{id,userId:auth.userId},select:{id:true}});if(!owner)return NextResponse.json({error:"Only the owner can revoke links"},{status:403});
  if(typeof body.shareId!=="string")return NextResponse.json({error:"A share link is required"},{status:400});
  await prisma.documentShare.updateMany({where:{id:body.shareId,documentId:id},data:{isActive:false}});
  const collaborationEligible=await prisma.document.findUnique({where:{id},select:{shares:{where:{isActive:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true},take:1},collaborators:{where:activeCollaboratorConstraint(),select:{id:true},take:1}}});
  return NextResponse.json({ok:true,collaborationEligible:collaborationEligible?hasRealtimeCollaboration(collaborationEligible):false});
}
