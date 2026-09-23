import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { isImageReferenced, validBearerToken } from "@/lib/maintenance";

export const runtime = "nodejs";
const batchSize = 100;

export async function GET(request: NextRequest) {
  if (!validBearerToken(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error:"Not authorized" }, { status:401, headers:{ "Cache-Control":"no-store" } });
  }

  const now = Date.now();
  const [buckets, previews, images] = await Promise.all([
    prisma.rateLimitBucket.findMany({ where:{ windowStart:{ lt:new Date(now - 48 * 60 * 60_000) } }, select:{ id:true }, take:batchSize }),
    prisma.linkPreview.findMany({ where:{ expiresAt:{ lt:new Date(now - 7 * 24 * 60 * 60_000) } }, select:{ urlHash:true }, take:batchSize }),
    prisma.documentImage.findMany({
      where:{ createdAt:{ lt:new Date(now - 30 * 24 * 60 * 60_000) } },
      select:{ id:true, fileName:true, document:{ select:{ content:true, versions:{ select:{ content:true } }, publication:{ select:{ content:true } } } } },
      take:batchSize,
      orderBy:{ createdAt:"asc" },
    }),
  ]);

  const orphaned = images.filter((image) => !isImageReferenced(image.fileName, [image.document.content, ...image.document.versions.map((version) => version.content), image.document.publication?.content]));
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const removedImageIds:string[] = [];
  for (const image of orphaned) {
    const { error } = await supabase.storage.from("document-images").remove([image.fileName]);
    if (!error) removedImageIds.push(image.id);
    else console.error("maintenance.image.remove_failed", { imageId:image.id, code:error.name });
  }

  const [bucketResult, previewResult, imageResult] = await prisma.$transaction([
    prisma.rateLimitBucket.deleteMany({ where:{ id:{ in:buckets.map((bucket) => bucket.id) } } }),
    prisma.linkPreview.deleteMany({ where:{ urlHash:{ in:previews.map((preview) => preview.urlHash) } } }),
    prisma.documentImage.deleteMany({ where:{ id:{ in:removedImageIds } } }),
  ]);
  return NextResponse.json({ ok:true, deleted:{ rateLimitBuckets:bucketResult.count, linkPreviews:previewResult.count, images:imageResult.count } }, { headers:{ "Cache-Control":"no-store" } });
}
