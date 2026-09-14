import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const path = (await params).path.join("/");
  const image = await prisma.documentImage.findFirst({ where: { fileName: path, document: { OR: [{ userId: auth.userId }, { collaborators: { some: { userId: auth.userId, acceptedAt: { not: null } } } }] } } });
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.storage.from("document-images").download(path);
  if (error || !data) return NextResponse.json({ error: "Image unavailable" }, { status: 404 });
  return new NextResponse(data, { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=300" } });
}

