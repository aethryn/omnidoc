import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";

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
    await prisma.user.upsert({
      where: { id: user.id },
      update: { email: user.email || "", name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User", avatar: user.user_metadata?.avatar_url || "vibrent_2.png" },
      create: { id: user.id, email: user.email || `${user.id}@supabase.local`, name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User", avatar: user.user_metadata?.avatar_url || "vibrent_2.png" },
    });
  }
  await getCurrentAuth();
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
