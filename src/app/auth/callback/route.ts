import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import { avatarFromAuthMetadata, nameFromAuthMetadata } from "@/lib/avatar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (!code) return NextResponse.redirect(new URL("/signin?error=oauth", url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin));

  const user = data.user;
  if (user) {
    const name = nameFromAuthMetadata(user.user_metadata) || user.email?.split("@")[0] || "User";
    const avatar = avatarFromAuthMetadata(user.user_metadata) || "/vibrent_2.png";
    await prisma.user.upsert({
      where: { id: user.id },
      update: { email: user.email || "", name, avatar },
      create: { id: user.id, email: user.email || `${user.id}@supabase.local`, name, avatar },
    });
  }
  await getCurrentAuth();
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
