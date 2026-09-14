import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type AuthResult = { userId?: string; error?: string };

export async function getCurrentUserIdFromRequest(_request?: unknown): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: "Not authenticated" };
  return { userId: data.user.id };
}

export function createAuthErrorResponse(_authResult?: AuthResult): NextResponse {
  return NextResponse.json(
    { error: "Not authenticated", code: "NOT_AUTHENTICATED" },
    { status: 401 }
  );
}
