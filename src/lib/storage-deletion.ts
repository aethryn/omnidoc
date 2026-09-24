import "server-only";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const documentImagesBucket = "document-images";

export function storageAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{ persistSession:false, autoRefreshToken:false } });
}

export async function enqueueStorageDeletion(bucket:string, objectPath:string, reason:string, sourceDocumentId?:string) {
  return prisma.storageDeletionJob.upsert({
    where:{ bucket_objectPath:{ bucket, objectPath } },
    create:{ bucket, objectPath, reason, sourceDocumentId },
    update:{ reason, sourceDocumentId:sourceDocumentId || undefined, nextAttemptAt:new Date(), lastErrorCode:null },
  });
}

export async function deleteQueuedStorageObjects(jobIds:string[]) {
  if (!jobIds.length) return { deleted:0, pending:0 };
  const jobs = await prisma.storageDeletionJob.findMany({ where:{ id:{ in:jobIds } }, orderBy:{ createdAt:"asc" } });
  let deleted = 0;
  const grouped=new Map<string, typeof jobs>();
  jobs.forEach((job)=>grouped.set(job.bucket,[...(grouped.get(job.bucket)||[]),job]));
  for (const [bucket, bucketJobs] of grouped) {
    for (let offset=0; offset<bucketJobs.length; offset+=1000) {
      const batch=bucketJobs.slice(offset,offset+1000);
      const { error }=await storageAdmin().storage.from(bucket).remove(batch.map((job)=>job.objectPath));
      if (!error) {
        const result=await prisma.storageDeletionJob.deleteMany({ where:{ id:{ in:batch.map((job)=>job.id) } } });
        deleted+=result.count;
      } else {
        await prisma.storageDeletionJob.updateMany({ where:{ id:{ in:batch.map((job)=>job.id) } }, data:{ retryCount:{ increment:1 }, nextAttemptAt:new Date(Date.now()+60_000), lastErrorCode:String(error.name || "STORAGE_ERROR").slice(0,100) } });
      }
    }
  }
  return { deleted, pending:jobs.length-deleted };
}

export function nextStorageRetry(retryCount:number) {
  return new Date(Date.now()+Math.min(24*60*60_000, 60_000 * 2 ** Math.min(retryCount,10)));
}
