import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorConstraint, documentAccessWhere, getCurrentAuth } from "@/lib/auth";
import DocumentEditorClient, { type InitialDocument } from "../DocumentEditorClient";

export default async function DocumentByIdPage({ params }: { params: Promise<{ id:string }> }) {
  const startedAt = performance.now();
  const { id } = await params;
  const auth = await getCurrentAuth();
  const { userId } = auth;
  if (!userId) redirect(`/signin?redirect=${encodeURIComponent(`/document/${id}`)}`);

  const [user, document] = await Promise.all([
    prisma.user.findUnique({ where:{ id:userId }, select:{ id:true,name:true,avatar:true } }),
    prisma.document.findFirst({
      where:{ id, ...documentAccessWhere(userId) },
      select:{
        id:true,title:true,content:true,yjsState:true,userId:true,status:true,allowComments:true,updatedAt:true,lastEditedAt:true,
        publication:{select:{id:true,slug:true,isActive:true,publishedAt:true,updatedAt:true,revisionHash:true}},
        shares:{where:{isActive:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true},take:1},
        user:{select:{id:true,name:true,avatar:true}},
        collaborators:{where:activeCollaboratorConstraint(),select:{role:true,user:{select:{id:true,name:true,avatar:true}}}},
      },
    }),
  ]);
  if (!user || !document) notFound();
  const role = document.userId === userId ? "owner" : document.collaborators.find((item: typeof document.collaborators[number]) => item.user.id === userId)?.role ?? "viewer";
  const initialDocument: InitialDocument = {
    id:document.id,title:document.title,content:document.content,role,status:document.status,allowComments:document.allowComments,updatedAt:document.updatedAt.toISOString(),lastEditedAt:document.lastEditedAt.toISOString(),
    publication:document.publication?{...document.publication,publishedAt:document.publication.publishedAt.toISOString(),updatedAt:document.publication.updatedAt.toISOString()}:null,
    yjsState:document.yjsState ? Buffer.from(document.yjsState).toString("base64") : null,
    collaborationEligible:Boolean(document.shares.length || document.collaborators.length),
    collaborators:[{...document.user,role:"owner"},...document.collaborators.map((item: typeof document.collaborators[number])=>({...item.user,role:item.role}))],
  };
  console.info(JSON.stringify({ event:"document.load", documentId:id, durationMs:Math.round(performance.now()-startedAt) }));
  return <DocumentEditorClient initialDocument={initialDocument} currentUser={{...user,name:auth.name||user.name,avatar:auth.avatar||user.avatar,color:"#7c4dcc",role}} />;
}
