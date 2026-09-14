import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;
  return prisma.user.upsert({
    where: { id: user.id },
    update: { email: user.email || "", name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User", avatar: user.user_metadata?.avatar_url || "vibrent_2.png" },
    create: { id: user.id, email: user.email || `${user.id}@supabase.local`, name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User", avatar: user.user_metadata?.avatar_url || "vibrent_2.png" },
  });
}

export async function GET() {
  const user = await getUser();
  return user ? NextResponse.json(user) : NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined;
  const avatar = typeof body.avatar === "string" ? body.avatar.slice(0, 500) : undefined;
  return NextResponse.json(await prisma.user.update({ where: { id: user.id }, data: { ...(name ? { name } : {}), ...(avatar ? { avatar } : {}) } }));
}

