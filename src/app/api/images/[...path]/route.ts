import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  const path = (await params).path.join("/");
  const access = auth.userId ? [{ userId: auth.userId }, { collaborators: { some: { userId: auth.userId, acceptedAt: { not: null } } } }] : [];
  const image = await prisma.documentImage.findFirst({
    where: { fileName: path, document: { OR: [...access, { publication: { is: { isActive: true } } }] } },
    select: { mimeType: true, document: { select: { publication: { select: { isActive: true, content: true } } } } },
  });
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const publication = image.document.publication;
  const publicImage = publication?.isActive === true && publication.content.includes(`/api/images/${path}`);
  if (!auth.userId && !publicImage) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.storage.from("document-images").download(path);
  if (error || !data) return NextResponse.json({ error: "Image unavailable" }, { status: 404 });
  return new NextResponse(data, { headers: { "Content-Type": image.mimeType, "Cache-Control": publicImage ? "public, max-age=300, s-maxage=300" : "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
