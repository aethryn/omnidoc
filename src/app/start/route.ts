import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await getCurrentAuth();
  if (auth.code === "SESSION_REVOKED") {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  const response = NextResponse.redirect(new URL(auth.userId ? "/dashboard" : "/signup", request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
