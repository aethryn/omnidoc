import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorConstraint,createAuthErrorResponse,getCurrentUserIdFromRequest } from "@/lib/auth";
import { hasRealtimeCollaboration } from "@/lib/collaboration-eligibility";
import { wsControl } from "@/lib/ws-control";

async function owner(id:string,userId:string){return prisma.document.findFirst({where:{id,userId},select:{id:true}});}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=await getCurrentUserIdFromRequest(request);if(!auth.userId)return createAuthErrorResponse(auth);
  const {id}=await params;if(!await owner(id,auth.userId))return NextResponse.json({error:"Only the owner can manage collaborators"},{status:403});
  const [members,liveResponse]=await Promise.all([
    prisma.documentCollaborators.findMany({where:{documentId:id,...activeCollaboratorConstraint()},orderBy:{acceptedAt:"desc"},select:{userId:true,role:true,acceptedAt:true,accessExpiresAt:true,user:{select:{id:true,name:true,email:true,avatar:true}}}}),
    wsControl("/rooms").catch(()=>null),
  ]);
  const live=liveResponse?.ok?await liveResponse.json().catch(()=>({rooms:[]})):{rooms:[]};
  const room=(live.rooms||[]).find((item:{documentId:string})=>item.documentId===id);
  return NextResponse.json({items:members.map((member)=>({...member,connectionCount:(room?.connections||[]).filter((connection:{userId:string})=>connection.userId===member.userId).length}))},{headers:{"Cache-Control":"no-store"}});
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=await getCurrentUserIdFromRequest(request);if(!auth.userId)return createAuthErrorResponse(auth);
  const {id}=await params;const body=await request.json().catch(()=>({}));const userId=typeof body.userId==="string"?body.userId:"";
  if(!userId)return NextResponse.json({error:"A collaborator is required"},{status:400});
  if(userId===auth.userId)return NextResponse.json({error:"Owners cannot revoke themselves"},{status:400});
  if(!await owner(id,auth.userId))return NextResponse.json({error:"Only the owner can manage collaborators"},{status:403});
  const persisted=await wsControl(`/rooms/${encodeURIComponent(id)}/persist`,{method:"POST"}).catch(()=>null);
  if(persisted&&!persisted.ok)return NextResponse.json({error:"Live changes could not be persisted"},{status:503,headers:{"Retry-After":"10"}});
  const result=await prisma.$transaction(async(tx)=>{
    const updated=await tx.documentCollaborators.updateMany({where:{documentId:id,userId,revokedAt:null},data:{revokedAt:new Date(),revokedBy:auth.userId}});
    if(updated.count)await tx.documentActivity.create({data:{documentId:id,userId:auth.userId!,action:"access-revoked",description:"Removed collaborator access"}});
    const state=await tx.document.findUnique({where:{id},select:{content:true,shares:{where:{isActive:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true},take:1},collaborators:{where:activeCollaboratorConstraint(),select:{id:true},take:1}}});
    return {updated:updated.count,state};
  });
  if(!result.updated)return NextResponse.json({error:"Collaborator not found"},{status:404});
  await wsControl(`/rooms/${encodeURIComponent(id)}/users/${encodeURIComponent(userId)}/disconnect`,{method:"POST"}).catch(()=>null);
  const collaborationEligible=result.state?hasRealtimeCollaboration(result.state):false;
  if(!collaborationEligible)await wsControl(`/rooms/${encodeURIComponent(id)}/drain`,{method:"POST"}).catch(()=>null);
  return NextResponse.json({ok:true,collaborationEligible,content:collaborationEligible?undefined:result.state?.content});
}
