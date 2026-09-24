import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isImageReferenced, validBearerToken } from "@/lib/maintenance";
import { deleteQueuedStorageObjects, documentImagesBucket, nextStorageRetry, storageAdmin } from "@/lib/storage-deletion";

export const runtime = "nodejs";
export const maxDuration = 60;
const batchSize=100;
const timeBudgetMs=45_000;

export async function GET(request:NextRequest) {
  if(!validBearerToken(request.headers.get("authorization"),process.env.CRON_SECRET))return NextResponse.json({error:"Not authorized"},{status:401,headers:{"Cache-Control":"no-store"}});
  const started=Date.now();
  const deleted={rateLimitBuckets:0,linkPreviews:0,images:0,storageJobs:0,sessions:0,versions:0};
  while(Date.now()-started<timeBudgetMs){
    const [buckets,previews,jobs]=await Promise.all([
      prisma.rateLimitBucket.findMany({where:{windowStart:{lt:new Date(Date.now()-48*60*60_000)}},select:{id:true},take:batchSize}),
      prisma.linkPreview.findMany({where:{expiresAt:{lt:new Date(Date.now()-7*24*60*60_000)}},select:{urlHash:true},take:batchSize}),
      prisma.storageDeletionJob.findMany({where:{nextAttemptAt:{lte:new Date()}},select:{id:true,retryCount:true},orderBy:[{nextAttemptAt:"asc"},{id:"asc"}],take:batchSize}),
    ]);
    const [bucketResult,previewResult]=await prisma.$transaction([
      prisma.rateLimitBucket.deleteMany({where:{id:{in:buckets.map((item)=>item.id)}}}),
      prisma.linkPreview.deleteMany({where:{urlHash:{in:previews.map((item)=>item.urlHash)}}}),
    ]);
    deleted.rateLimitBuckets+=bucketResult.count;deleted.linkPreviews+=previewResult.count;
    if(jobs.length){
      const result=await deleteQueuedStorageObjects(jobs.map((job)=>job.id));
      deleted.storageJobs+=result.deleted;
      if(result.pending)await Promise.all(jobs.map((job)=>prisma.storageDeletionJob.updateMany({where:{id:job.id},data:{nextAttemptAt:nextStorageRetry(job.retryCount+1)}})));
    }
    if(buckets.length<batchSize&&previews.length<batchSize&&jobs.length<batchSize)break;
  }
  while(Date.now()-started<timeBudgetMs){
    const images=await prisma.documentImage.findMany({where:{createdAt:{lt:new Date(Date.now()-30*24*60*60_000)}},select:{id:true,fileName:true,document:{select:{content:true,versions:{select:{content:true}},publication:{select:{content:true}}}}},take:batchSize,orderBy:{createdAt:"asc"}});
    const orphaned=images.filter((image)=>!isImageReferenced(image.fileName,[image.document.content,...image.document.versions.map((version)=>version.content),image.document.publication?.content]));
    if(orphaned.length){
      const {error}=await storageAdmin().storage.from(documentImagesBucket).remove(orphaned.map((image)=>image.fileName));
      if(!error)deleted.images+=(await prisma.documentImage.deleteMany({where:{id:{in:orphaned.map((image)=>image.id)}}})).count;
      else console.error("maintenance.image_batch_failed",{code:error.name,count:orphaned.length});
    }
    if(images.length<batchSize||!orphaned.length)break;
  }
  deleted.sessions=(await prisma.appSession.deleteMany({where:{revokedAt:null,lastSeenAt:{lt:new Date(Date.now()-90*24*60*60_000)}}})).count;
  deleted.versions=await prisma.$executeRaw`
    WITH ranked AS (
      SELECT "id", ROW_NUMBER() OVER (PARTITION BY "documentId" ORDER BY "createdAt" DESC) AS rn
      FROM "DocumentVersion" WHERE "source" IN ('automatic','session-close')
    )
    DELETE FROM "DocumentVersion" v USING ranked r
    WHERE v."id"=r."id" AND r.rn>20 AND v."createdAt" < CURRENT_TIMESTAMP - INTERVAL '90 days'
  `;
  return NextResponse.json({ok:true,deleted,durationMs:Date.now()-started},{headers:{"Cache-Control":"no-store"}});
}
