#!/usr/bin/env tsx

import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { contentToYDoc, yDocToContent } from "@/lib/document-yjs";
import { deriveDocumentPreview } from "@/lib/document-content";

const PORT = Number(process.env.PORT || process.env.WEBSOCKET_PORT || 4000);
const HOST = process.env.WEBSOCKET_HOST || "0.0.0.0";
const messageSync = 0;
const messageAwareness = 1;
type Connection = { ws: WebSocket; userId: string; canEdit: boolean; awarenessIds: Set<number> };
type ActiveRoom = { doc: Y.Doc; awareness: awarenessProtocol.Awareness; roomId: string; saveTimer?: NodeJS.Timeout };

const active = new Map<string, ActiveRoom>();
const connections = new Map<string, Set<Connection>>();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: active.size }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("Omnidoc collaboration server\n");
});

const wss = new WebSocketServer({ server, maxPayload: 5 * 1024 * 1024 });

async function persist(documentId: string) {
  const room = active.get(documentId);
  if (!room) return;
  const content = yDocToContent(room.doc);
  await prisma.document.update({
    where: { id: documentId },
    data: {
      yjsState: Buffer.from(Y.encodeStateAsUpdate(room.doc)),
      content,
      ...deriveDocumentPreview(content),
      lastEditedAt: new Date(),
    },
  });
}

function schedulePersist(documentId: string) {
  const room = active.get(documentId);
  if (!room) return;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    persist(documentId).catch((error) => console.error("Yjs persistence failed", error));
  }, 750);
}

async function loadRoom(documentId: string) {
  const existing = active.get(documentId);
  if (existing) return existing;
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, yjsState: true, content:true } });
  if (!document) return null;
  let doc = document.yjsState ? new Y.Doc() : contentToYDoc(document.content);
  if (document.yjsState) {
    Y.applyUpdate(doc, new Uint8Array(document.yjsState));
    if (doc.getXmlFragment("default").length === 0 && document.content) doc = contentToYDoc(document.content);
  }
  const awareness = new awarenessProtocol.Awareness(doc);
  const room:ActiveRoom = { doc, awareness, roomId: document.id };
  active.set(documentId, room);
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    schedulePersist(documentId);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    connections.get(documentId)?.forEach(({ ws }) => {
      if (ws !== origin && ws.readyState === WebSocket.OPEN) ws.send(encoding.toUint8Array(encoder));
    });
  });
  awareness.on("update", ({added,updated,removed}:{added:number[];updated:number[];removed:number[]}, origin:unknown) => {
    const changed=[...added,...updated,...removed];
    const connection=origin as Connection|undefined;
    if(connection?.awarenessIds){added.concat(updated).forEach((id)=>connection.awarenessIds.add(id));removed.forEach((id)=>connection.awarenessIds.delete(id));}
    if(!changed.length)return;
    const encoder=encoding.createEncoder();encoding.writeVarUint(encoder,messageAwareness);encoding.writeVarUint8Array(encoder,awarenessProtocol.encodeAwarenessUpdate(awareness,changed));
    const message=encoding.toUint8Array(encoder);connections.get(documentId)?.forEach(({ws})=>{if(ws.readyState===WebSocket.OPEN)ws.send(message);});
  });
  return room;
}

wss.on("connection", async (ws, request) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const documentId = url.pathname.split("/").filter(Boolean).pop();
  const token = url.searchParams.get("token");
  if (!documentId || !token) return ws.close(1008, "Authentication required");

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return ws.close(1008, "Invalid session");

  const document = await prisma.document.findFirst({
    where: { id: documentId, OR: [{ userId: user.id }, { collaborators: { some: { userId: user.id, acceptedAt: { not: null } } } }] },
    select: { id: true, userId:true, collaborators:{where:{userId:user.id,acceptedAt:{not:null}},select:{role:true}} },
  });
  if (!document) return ws.close(1008, "Document access denied");

  const room = await loadRoom(documentId);
  if (!room) return ws.close(1008, "Document not found");
  const role=document.userId===user.id?"owner":document.collaborators[0]?.role;
  const entry:Connection = { ws, userId: user.id, canEdit:role!=="viewer", awarenessIds:new Set() };
  if (!connections.has(documentId)) connections.set(documentId, new Set());
  connections.get(documentId)!.add(entry);

  const initial = encoding.createEncoder();
  encoding.writeVarUint(initial, messageSync);
  syncProtocol.writeSyncStep1(initial, room.doc);
  ws.send(encoding.toUint8Array(initial));
  const existingIds=Array.from(room.awareness.getStates().keys());
  if(existingIds.length){const awareness=encoding.createEncoder();encoding.writeVarUint(awareness,messageAwareness);encoding.writeVarUint8Array(awareness,awarenessProtocol.encodeAwarenessUpdate(room.awareness,existingIds));ws.send(encoding.toUint8Array(awareness));}

  ws.on("message", (raw) => {
    const decoder = decoding.createDecoder(new Uint8Array(raw as Buffer));
    const type = decoding.readVarUint(decoder);
    if (type === messageSync) {
      const response = encoding.createEncoder();
      encoding.writeVarUint(response, messageSync);
      const syncType=decoding.readVarUint(decoder);
      if(syncType===syncProtocol.messageYjsSyncStep1)syncProtocol.readSyncStep1(decoder,response,room.doc);
      else if(entry.canEdit&&syncType===syncProtocol.messageYjsSyncStep2)syncProtocol.readSyncStep2(decoder,room.doc,ws);
      else if(entry.canEdit&&syncType===syncProtocol.messageYjsUpdate)syncProtocol.readUpdate(decoder,room.doc,ws);
      if (encoding.length(response) > 1) ws.send(encoding.toUint8Array(response));
    } else if (type === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness,decoding.readVarUint8Array(decoder),entry);
    }
  });

  ws.on("close", async () => {
    awarenessProtocol.removeAwarenessStates(room.awareness,Array.from(entry.awarenessIds),entry);
    connections.get(documentId)?.delete(entry);
    if (!connections.get(documentId)?.size) {
      await persist(documentId).catch((error) => console.error("Final Yjs persistence failed", error));
      const current = active.get(documentId);
      if (current?.saveTimer) clearTimeout(current.saveTimer);
      active.delete(documentId);
      connections.delete(documentId);
    }
  });
  ws.on("error", (error) => console.error("WebSocket error", error));
});

const shutdown = async () => {
  for (const documentId of active.keys()) await persist(documentId).catch(console.error);
  wss.clients.forEach((client) => client.close(1001, "Server restarting"));
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.listen(PORT, HOST, () => console.log(`Omnidoc WebSocket server listening on ${HOST}:${PORT}`));
