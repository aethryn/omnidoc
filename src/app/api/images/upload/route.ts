import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const formData = await request.formData();
  const file = formData.get("file");
  const documentId = String(formData.get("documentId") || "");
  if (!(file instanceof File) || !documentId) return NextResponse.json({ error: "File and documentId are required" }, { status: 400 });
  if (!ALLOWED.has(file.type) || file.size > MAX_SIZE) return NextResponse.json({ error: "Use a JPEG, PNG, WebP, or GIF image up to 5 MB" }, { status: 400 });
  const document = await prisma.document.findFirst({ where: { id: documentId, OR: [{ userId: auth.userId }, { collaborators: { some: { userId: auth.userId, role: { in: ["editor", "admin"] }, acceptedAt: { not: null } } } }] }, select: { id: true } });
  if (!document) return NextResponse.json({ error: "Document access denied" }, { status: 403 });
  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const storagePath = `${documentId}/${randomUUID()}.${extension}`;
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supabase.storage.from("document-images").upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  const record = await prisma.documentImage.create({ data: { documentId, fileName: storagePath, originalName: file.name.slice(0, 255), fileUrl: `/api/images/${storagePath}`, fileSize: file.size, mimeType: file.type } });
  return NextResponse.json(record, { status: 201 });
}
