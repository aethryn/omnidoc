import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
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
