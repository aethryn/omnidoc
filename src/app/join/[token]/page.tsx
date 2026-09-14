import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/signin?redirect=${encodeURIComponent(`/api/share/${token}/accept`)}`);
  redirect(`/api/share/${encodeURIComponent(token)}/accept`);
}
