import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, getCurrentUserIdFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getCurrentUserIdFromRequest(request);
  const path = (await params).path.join("/");
  const access = auth.userId ? documentAccessWhere(auth.userId).OR : [];
  const image = await prisma.documentImage.findFirst({
    where: { fileName: path, document: { OR: [...access, { publication: { is: { isActive: true } } }] } },
    select: { mimeType: true, document: { select: { publication: { select: { isActive: true, content: true } } } } },
  });
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const publication = image.document.publication;
  const publicImage = publication?.isActive === true && publication.content.includes(`/api/images/${path}`);
  if (!auth.userId && !publicImage) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.storage.from("document-images").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Image unavailable" }, { status: 404 });
  const response = NextResponse.redirect(data.signedUrl, 302);
  response.headers.set("Cache-Control", publicImage ? "public, max-age=240, s-maxage=240" : "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
