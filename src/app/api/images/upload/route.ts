import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import sharp, { type Metadata } from "sharp";

const MAX_SIZE = 500 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif"]);

export async function POST(request: NextRequest) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const rate = await enforceRateLimit("image-upload", auth.userId, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many uploads", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const formData = await request.formData();
  const file = formData.get("file");
  const documentId = String(formData.get("documentId") || "");
  if (!(file instanceof File) || !documentId) return NextResponse.json({ error: "File and documentId are required" }, { status: 400 });
  if (!ALLOWED.has(file.type) || file.size > MAX_SIZE) return NextResponse.json({ error: "Use a JPEG, PNG, or GIF image up to 500 KB" }, { status: 400 });
  const document = await prisma.document.findFirst({ where: { id: documentId, ...documentAccessWhere(auth.userId, ["editor", "admin"]) }, select: { id: true } });
  if (!document) return NextResponse.json({ error: "Document access denied" }, { status: 403 });
  const input = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try { metadata = await sharp(input, { animated: true, limitInputPixels: 24_000_000 }).metadata(); }
  catch { return NextResponse.json({ error: "The selected image is malformed or too large to process" }, { status: 400 }); }
  const expected = new Map([["image/jpeg", "jpeg"], ["image/png", "png"], ["image/gif", "gif"]]);
  if (metadata.format !== expected.get(file.type) || !metadata.width || !metadata.height) return NextResponse.json({ error: "The file contents do not match its image format" }, { status: 400 });
  if (metadata.width * metadata.height > 24_000_000) return NextResponse.json({ error: "Image dimensions are too large" }, { status: 400 });
  const output = input;
  const outputMetadata = metadata;
  const outputMime = file.type;
  const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
  const storagePath = `${documentId}/${randomUUID()}.${extension}`;
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supabase.storage.from("document-images").upload(storagePath, output, { contentType: outputMime, upsert: false });
  if (error) return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  try {
    const record = await prisma.documentImage.create({ data: { documentId, fileName: storagePath, originalName: file.name.slice(0, 255), fileUrl: `/api/images/${storagePath}`, fileSize: output.byteLength, mimeType: outputMime, width: outputMetadata.width, height: outputMetadata.height } });
    return NextResponse.json(record, { status: 201 });
  } catch (databaseError) {
    await supabase.storage.from("document-images").remove([storagePath]);
    console.error("Image record creation failed", databaseError);
    return NextResponse.json({ error: "Image upload could not be completed" }, { status: 500 });
  }
}
