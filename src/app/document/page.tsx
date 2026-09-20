import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import DocumentEditorClient from "./DocumentEditorClient";

export default async function NewDocumentPage() {
  const { userId } = await getCurrentAuth();
  if (!userId) redirect("/signin?redirect=/document");
  const user = await prisma.user.findUnique({ where:{ id:userId }, select:{ id:true,name:true,avatar:true } });
  if (!user) redirect("/signin?redirect=/document");
  return <DocumentEditorClient currentUser={{ ...user, color:"#7c4dcc", role:"owner" }} />;
}
