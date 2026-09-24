import "server-only";

export type LiveConnection = { connectionId:string; userId:string; documentId:string; role:string; connectedAt:string; lastActivityAt:string };
export type LiveRoom = { documentId:string; ownerId:string; connections:LiveConnection[] };

export async function wsControl(path:string, init:RequestInit={}) {
  const base=process.env.WS_SERVICE_URL;
  const secret=process.env.WS_CONTROL_SECRET;
  if (!base || !secret) return null;
  return fetch(`${base.replace(/\/$/,"")}/control${path}`, { ...init, headers:{ Authorization:`Bearer ${secret}`, "Content-Type":"application/json", ...(init.headers || {}) }, cache:"no-store", signal:AbortSignal.timeout(10_000) });
}

export async function drainRoom(documentId:string) {
  const response=await wsControl(`/rooms/${encodeURIComponent(documentId)}/drain`, { method:"POST" });
  if (!response) return { ok:true, configured:false };
  return { ok:response.ok, configured:true };
}
