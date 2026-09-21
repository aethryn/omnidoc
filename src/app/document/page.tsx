import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import DocumentEditorClient from "./DocumentEditorClient";

export default async function NewDocumentPage() {
  const auth = await getCurrentAuth();
  const { userId } = auth;
  if (!userId) redirect("/signin?redirect=/document");
  const user = await prisma.user.findUnique({ where:{ id:userId }, select:{ id:true,name:true,avatar:true } });
  if (!user) redirect("/signin?redirect=/document");
  return <DocumentEditorClient currentUser={{ ...user, name:auth.name||user.name, avatar:auth.avatar||user.avatar, color:"#7c4dcc", role:"owner" }} />;
}
