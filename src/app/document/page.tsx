import { redirect } from "next/navigation";

export default async function LegacyDocumentPage({ searchParams }: { searchParams: Promise<{ document?: string }> }) {
  const { document } = await searchParams;
  redirect(document ? `/document/${encodeURIComponent(document)}` : "/dashboard");
}

