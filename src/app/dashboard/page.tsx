import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const startedAt = performance.now();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/signin?redirect=/dashboard");

  const [user, documents] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, avatar: true } }),
    prisma.document.findMany({
      where: { OR: [{ userId }, { collaborators: { some: { userId, acceptedAt: { not: null } } } }] },
      orderBy: { lastEditedAt: "desc" },
      select: {
        id: true, title: true, userId: true, status:true, previewText:true, previewImageUrl:true, wordCount:true, updatedAt: true, lastEditedAt: true,
        publication:{select:{id:true,slug:true,isActive:true,publishedAt:true,updatedAt:true}},
        collaborators: { where: { acceptedAt: { not: null } }, select: { role: true, user: { select: { id: true, name: true, avatar: true } } } },
      },
    }),
  ]);
  if (!user) redirect("/auth/callback?next=/dashboard");

  if (process.env.NODE_ENV !== "test") {
    console.info(JSON.stringify({ event: "dashboard.load", durationMs: Math.round(performance.now() - startedAt), documentCount: documents.length }));
  }

  return <DashboardClient greeting={new Date().getUTCHours() < 12 ? "morning" : "to see you"} user={user} documents={documents.map((doc) => ({ ...doc, updatedAt: doc.updatedAt.toISOString(), lastEditedAt: doc.lastEditedAt.toISOString(), publication:doc.publication?{...doc.publication,publishedAt:doc.publication.publishedAt.toISOString(),updatedAt:doc.publication.updatedAt.toISOString()}:null, owned: doc.userId === userId }))} />;
}
