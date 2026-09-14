import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import DocumentEditorClient, { type InitialDocument } from "../DocumentEditorClient";

export default async function DocumentByIdPage({ params }: { params: Promise<{ id:string }> }) {
  const startedAt = performance.now();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect(`/signin?redirect=${encodeURIComponent(`/document/${id}`)}`);

  const [user, document] = await Promise.all([
    prisma.user.findUnique({ where:{ id:userId }, select:{ id:true,name:true,avatar:true } }),
    prisma.document.findFirst({
      where:{ id, OR:[{userId},{isPublic:true},{collaborators:{some:{userId,acceptedAt:{not:null}}}}] },
      select:{
        id:true,title:true,content:true,yjsState:true,userId:true,updatedAt:true,
        user:{select:{id:true,name:true,avatar:true}},
        collaborators:{where:{acceptedAt:{not:null}},select:{role:true,user:{select:{id:true,name:true,avatar:true}}}},
      },
    }),
  ]);
  if (!user || !document) notFound();
  const role = document.userId === userId ? "owner" : document.collaborators.find((item) => item.user.id === userId)?.role ?? "viewer";
  const initialDocument: InitialDocument = {
    id:document.id,title:document.title,content:document.content,role,updatedAt:document.updatedAt.toISOString(),
    yjsState:document.yjsState ? Buffer.from(document.yjsState).toString("base64") : null,
    collaborators:[{...document.user,role:"owner"},...document.collaborators.map((item)=>({...item.user,role:item.role}))],
  };
  console.info(JSON.stringify({ event:"document.load", documentId:id, durationMs:Math.round(performance.now()-startedAt) }));
  return <DocumentEditorClient initialDocument={initialDocument} currentUser={{...user,color:"#7c4dcc",role}} />;
}
