#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/lib/prisma";

const apply=process.argv.includes("--apply");
const bucket="document-images";
const cutoff=Date.now()-24*60*60_000;
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});

async function listFolder(prefix=""):Promise<Array<{path:string;createdAt:number}>>{
  const found:Array<{path:string;createdAt:number}>=[];
  for(let offset=0;;offset+=100){
    const {data,error}=await supabase.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
    if(error)throw error;
    for(const entry of data||[]){
      const path=prefix?`${prefix}/${entry.name}`:entry.name;
      if(entry.id)found.push({path,createdAt:new Date(entry.created_at||entry.updated_at||0).getTime()});
      else found.push(...await listFolder(path));
    }
    if((data||[]).length<100)break;
  }
  return found;
}

async function main(){
  const [objects,rows]=await Promise.all([listFolder(),prisma.documentImage.findMany({select:{fileName:true}})]);
  const referenced=new Set(rows.map((row)=>row.fileName));
  const orphaned=objects.filter((object)=>object.createdAt<cutoff&&!referenced.has(object.path));
  console.log(JSON.stringify({mode:apply?"apply":"dry-run",objects:objects.length,referenced:referenced.size,eligibleOrphans:orphaned.length,sample:orphaned.slice(0,20).map((item)=>item.path)},null,2));
  if(apply)for(let offset=0;offset<orphaned.length;offset+=100){const batch=orphaned.slice(offset,offset+100);const {error}=await supabase.storage.from(bucket).remove(batch.map((item)=>item.path));if(error)throw error;console.log(`deleted ${Math.min(offset+batch.length,orphaned.length)}/${orphaned.length}`);}
}
main().finally(()=>prisma.$disconnect());
