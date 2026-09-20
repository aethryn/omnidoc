import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { userId } = await getCurrentAuth();
  if (!userId) redirect(`/signin?redirect=${encodeURIComponent(`/api/share/${token}/accept`)}`);
  redirect(`/api/share/${encodeURIComponent(token)}/accept`);
}
