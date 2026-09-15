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
import { documentContentHash } from "@/lib/document-version";

const PORT = Number(process.env.PORT || process.env.WEBSOCKET_PORT || 4000);
const HOST = process.env.WEBSOCKET_HOST || "0.0.0.0";
const messageSync = 0;
const messageAwareness = 1;
const messageApplication = 4;
const persistDebounceMs = 1500;
const versionIdleMs = 120_000;
const versionSnapshotIntervalMs = 15 * 60_000;
const orphanRetentionMs = 30 * 24 * 60 * 60 * 1000;
const orphanCleanupIntervalMs = 24 * 60 * 60 * 1000;
type PersistRequest = { connection: Connection; sequence: number; revision: number; checkpoint?: { description?: string; title?: string; source?: string } };
type Connection = { ws: WebSocket; userId: string; canEdit: boolean; awarenessIds: Set<number> };
type ActiveRoom = { doc: Y.Doc; awareness: awarenessProtocol.Awareness; roomId: string; ownerId: string; title:string; lastEditorId?: string; revision: number; persistedRevision: number; versionRevision?: number; lastVersionAt?: number; changeStartedAt?: number; snapshotRequested?: boolean; pendingRequests:PersistRequest[]; saveTimer?: NodeJS.Timeout; versionTimer?: NodeJS.Timeout; persistPromise?: Promise<void> };

const active = new Map<string, ActiveRoom>();
const loadingRooms = new Map<string, Promise<ActiveRoom | null>>();
const connections = new Map<string, Set<Connection>>();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
const storageAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

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

async function cleanupOrphanImages() {
  if (!storageAdmin) {
    console.warn("Skipping orphan image cleanup: SUPABASE_SERVICE_ROLE_KEY is not configured");
    return;
  }
  const cutoff = new Date(Date.now() - orphanRetentionMs);
  const candidates = await prisma.documentImage.findMany({
    where: { createdAt: { lt: cutoff } },
    select: {
      id: true,
      fileName: true,
      document: {
        select: {
          content: true,
          versions: { select: { content: true } },
          publication: { select: { content: true } },
        },
      },
    },
  });

  for (const candidate of candidates) {
    const reference = `/api/images/${candidate.fileName}`;
    const referenced = [
      candidate.document.content,
      ...candidate.document.versions.map((version: { content: string }) => version.content),
      candidate.document.publication?.content,
    ].some((content) => content?.includes(reference));
    if (referenced) continue;

    const { error } = await storageAdmin.storage.from("document-images").remove([candidate.fileName]);
    if (error) {
      console.error("Orphan image storage cleanup failed", candidate.fileName, error.message);
      continue;
    }
    await prisma.documentImage.delete({ where: { id: candidate.id } }).catch((error: unknown) => console.error("Orphan image metadata cleanup failed", candidate.fileName, error));
  }
}

function sendApplication(ws: WebSocket, payload: Record<string, unknown>) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageApplication);
  encoding.writeVarString(encoder, JSON.stringify(payload));
  ws.send(encoding.toUint8Array(encoder));
}

async function persist(documentId: string, forceVersion = false) {
  const room = active.get(documentId);
  if (!room) return;
  if (room.persistPromise) {
    if (forceVersion) room.snapshotRequested = true;
    await room.persistPromise;
    if (room.revision > room.persistedRevision || room.snapshotRequested || room.pendingRequests.some((request) => request.checkpoint)) await persist(documentId, room.snapshotRequested);
    return;
  }
  if (!forceVersion && room.revision === room.persistedRevision && !room.snapshotRequested && !room.pendingRequests.some((request) => request.checkpoint)) return;
  const revision = room.revision;
  const content = yDocToContent(room.doc);
  const requests = room.pendingRequests.filter((request) => request.revision <= revision);
  const checkpoint = requests.find((request) => request.checkpoint)?.checkpoint;
  const hasUnversionedChanges = room.revision > (room.versionRevision ?? -1);
  const createVersion = hasUnversionedChanges && (forceVersion || Boolean(checkpoint) || Boolean(room.snapshotRequested));
  room.snapshotRequested = false;
  const operation = (async () => {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        yjsState: Buffer.from(Y.encodeStateAsUpdate(room.doc)),
        content,
        ...deriveDocumentPreview(content),
        lastEditedAt: new Date(),
      },
    });
    if (createVersion) {
      try {
        const latestVersion = await prisma.documentVersion.findFirst({ where: { documentId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
        const title = checkpoint?.title?.trim() || room.title;
        const contentHash = documentContentHash(title, content);
        const existing = await prisma.documentVersion.findUnique({ where: { documentId_contentHash: { documentId, contentHash } }, select: { id:true, versionNumber:true } });
        if (!existing) await prisma.documentVersion.create({ data: { documentId, title, content, versionNumber: (latestVersion?.versionNumber || 0) + 1, changeDescription: checkpoint?.description || (forceVersion ? "Collaborative session snapshot" : "Automatic checkpoint"), source: checkpoint?.source || (forceVersion ? "session-close" : "automatic"), contentHash, contributors: Array.from(new Set([room.lastEditorId || room.ownerId, ...requests.map((request) => request.connection.userId)])), createdBy: room.lastEditorId || room.ownerId } });
        room.versionRevision = revision;
        room.lastVersionAt = Date.now();
        room.changeStartedAt = undefined;
      } catch (error) {
        console.error("Yjs version snapshot failed", error);
      }
    }
    room.persistedRevision = revision;
    room.pendingRequests = room.pendingRequests.filter((request) => request.revision > revision);
    requests.forEach((request) => { if (request.connection.ws.readyState === WebSocket.OPEN) sendApplication(request.connection.ws, { kind:"persisted", sequence:request.sequence, persistedAt:new Date().toISOString() }); });
  })();
  room.persistPromise = operation;
  try { await operation; } finally { if (room.persistPromise === operation) room.persistPromise = undefined; }

  const current = active.get(documentId);
  if (current !== room || (room.revision <= revision && !room.snapshotRequested)) return;
  if (connections.get(documentId)?.size) schedulePersist(documentId);
  else await persist(documentId, room.snapshotRequested);
}

function schedulePersist(documentId: string) {
  const room = active.get(documentId);
  if (!room) return;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    persist(documentId).catch((error) => console.error("Yjs persistence failed", error));
  }, persistDebounceMs);
}

function scheduleVersion(documentId: string) {
  const room = active.get(documentId);
  if (!room || !room.changeStartedAt) return;
  if (room.versionTimer) clearTimeout(room.versionTimer);
  const maxRemaining = versionSnapshotIntervalMs - (Date.now() - room.changeStartedAt);
  const delay = Math.max(0, Math.min(versionIdleMs, maxRemaining));
  room.versionTimer = setTimeout(() => { room.snapshotRequested = true; persist(documentId).catch((error) => console.error("Automatic version checkpoint failed", error)); }, delay);
}

async function loadRoom(documentId: string) {
  const existing = active.get(documentId);
  if (existing) return existing;
  const loading = loadingRooms.get(documentId);
  if (loading) return loading;

  const promise = (async () => {
    const current = active.get(documentId);
    if (current) return current;
    const document = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, userId: true, title:true, yjsState: true, content:true } });
    if (!document) return null;
    let doc = document.yjsState ? new Y.Doc() : contentToYDoc(document.content);
    if (document.yjsState) {
      Y.applyUpdate(doc, new Uint8Array(document.yjsState));
      if (doc.getXmlFragment("default").length === 0 && document.content) doc = contentToYDoc(document.content);
    }
    const awareness = new awarenessProtocol.Awareness(doc);
    const room:ActiveRoom = { doc, awareness, roomId: document.id, ownerId: document.userId, title:document.title, revision:0, persistedRevision:0, pendingRequests:[] };
    active.set(documentId, room);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      room.revision += 1;
      const editor = Array.from(connections.get(documentId) || []).find(({ ws }) => ws === origin);
      if (editor) room.lastEditorId = editor.userId;
      schedulePersist(documentId);
      room.changeStartedAt ||= Date.now();
      scheduleVersion(documentId);
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
      const message=encoding.toUint8Array(encoder);connections.get(documentId)?.forEach(({ws})=>{if(ws!==connection?.ws&&ws.readyState===WebSocket.OPEN)ws.send(message);});
    });
    return room;
  })();
  loadingRooms.set(documentId, promise);
  try { return await promise; } finally { if (loadingRooms.get(documentId) === promise) loadingRooms.delete(documentId); }
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

  ws.on("message", (raw, isBinary) => {
    if (!isBinary || typeof raw === "string") return;
    try {
      const decoder = decoding.createDecoder(new Uint8Array(raw as Buffer));
      const type = decoding.readVarUint(decoder);
      if (type === messageSync) {
        const response = encoding.createEncoder();
        encoding.writeVarUint(response, messageSync);
        const syncType=decoding.readVarUint(decoder);
        if(syncType===syncProtocol.messageYjsSyncStep1)syncProtocol.readSyncStep1(decoder,response,room.doc);
        else if(entry.canEdit&&syncType===syncProtocol.messageYjsSyncStep2)syncProtocol.readSyncStep2(decoder,room.doc,ws);
        else if(entry.canEdit&&syncType===syncProtocol.messageYjsUpdate)syncProtocol.readUpdate(decoder,room.doc,ws);
        if (encoding.length(response) > 1 && ws.readyState === WebSocket.OPEN) ws.send(encoding.toUint8Array(response));
      } else if (type === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness,decoding.readVarUint8Array(decoder),entry);
      } else if (type === messageApplication) {
        const payload = JSON.parse(decoding.readVarString(decoder)) as { kind?:string; sequence?:number; checkpoint?:{description?:string;title?:string;source?:string} };
        const sequence = payload.sequence;
        if (payload.kind !== "persist-request" || typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0 || (payload.checkpoint && !entry.canEdit)) return;
        room.pendingRequests.push({ connection:entry, sequence, revision:room.revision, checkpoint:payload.checkpoint });
        if (payload.checkpoint) room.snapshotRequested = true;
        void persist(documentId);
      }
    } catch (error) {
      console.error("Invalid collaboration message", error);
      ws.close(1003, "Invalid collaboration message");
    }
  });

  ws.on("close", async () => {
    awarenessProtocol.removeAwarenessStates(room.awareness,Array.from(entry.awarenessIds),entry);
    connections.get(documentId)?.delete(entry);
    if (!connections.get(documentId)?.size) {
      const room = active.get(documentId);
      if (room?.saveTimer) clearTimeout(room.saveTimer);
      if (room?.versionTimer) clearTimeout(room.versionTimer);
      if (room && (room.persistPromise || room.revision > room.persistedRevision)) await persist(documentId, true).catch((error) => console.error("Final Yjs persistence failed", error));
      const current = active.get(documentId);
      if (current === room && !connections.get(documentId)?.size) {
        active.delete(documentId);
        connections.delete(documentId);
      }
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
const cleanupTimer = setInterval(() => { cleanupOrphanImages().catch((error) => console.error("Orphan image cleanup failed", error)); }, orphanCleanupIntervalMs);
cleanupTimer.unref();
server.listen(PORT, HOST, () => {
  console.log(`Omnidoc WebSocket server listening on ${HOST}:${PORT}`);
  cleanupOrphanImages().catch((error) => console.error("Initial orphan image cleanup failed", error));
});
