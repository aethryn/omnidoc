import { redirect } from "next/navigation";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/api/share/${encodeURIComponent(token)}/accept`);
}

