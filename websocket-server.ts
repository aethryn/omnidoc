#!/usr/bin/env tsx

import http from "http";
import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { activeCollaboratorWhere, documentAccessWhere } from "@/lib/auth";
import { contentToYDoc, yDocToContent } from "@/lib/document-yjs";
import { deriveDocumentPreview } from "@/lib/document-content";
import { allocateDocumentVersionNumber, documentContentHash } from "@/lib/document-version";
import { CollaborationBus, type CollaborationBusMessage } from "@/lib/collaboration-bus";
import { collaborationSessionStatus } from "@/lib/collaboration-session";
import { getRedisClient } from "@/lib/redis";
import { nextHeartbeatMissCount, resetHeartbeat, shouldTerminateHeartbeat, websocketHeartbeatIntervalMs } from "@/lib/websocket-liveness";
import type { PersistCheckpoint } from "@/lib/collaboration-persistence";

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
const redisBatchMs = 50;
type RedisOrigin = { kind: "redis"; id: string; sender: string };
type PersistRequest = { connection: Connection; markerId: string; clientId: string; sequence: number; revision: number; checkpoint?: PersistCheckpoint };
type Connection = { ws: WebSocket; userId: string; sessionId?: string; canEdit: boolean; awarenessIds: Set<number>; accessExpiresAt?: Date | null; expiryTimer?: NodeJS.Timeout; closed?: boolean; expired?: boolean };
type ActiveRoom = { doc: Y.Doc; awareness: awarenessProtocol.Awareness; roomId: string; ownerId: string; title:string; lastEditorId?: string; revision: number; persistedRevision: number; versionRevision?: number; lastVersionAt?: number; changeStartedAt?: number; snapshotRequested?: boolean; pendingRequests:PersistRequest[]; acknowledgedMarkers: Map<string, { revision:number; persistedAt:string }>; saveTimer?: NodeJS.Timeout; versionTimer?: NodeJS.Timeout; persistRetryTimer?: NodeJS.Timeout; persistRetryAttempt?: number; persistPromise?: Promise<void>; cleanupPromise?: Promise<void>; redisUnsubscribe?: () => Promise<void>; redisUpdates: Uint8Array[]; redisUpdateTimer?: NodeJS.Timeout };

const active = new Map<string, ActiveRoom>();
const loadingRooms = new Map<string, Promise<ActiveRoom | null>>();
const connections = new Map<string, Set<Connection>>();
const liveConnections = new Set<Connection>();
const instanceId = randomUUID();
const collaborationBus = new CollaborationBus(process.env.REDIS_URL, process.env.WS_REDIS_REQUIRED === "true");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
const storageAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const server = http.createServer(async (request, response) => {
  if (request.url === "/health") {
    const connectionCount = Array.from(connections.values()).reduce((total, roomConnections) => total + roomConnections.size, 0);
    const redisRequired = process.env.WS_REDIS_REQUIRED === "true";
    const redis = await collaborationBus.ensureConnected();
    const ok = !redisRequired || redis === "ready";
    response.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok, rooms: active.size, connections: connectionCount, redis, redisRequired, redisRooms: collaborationBus.subscribedRooms }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("Omnidoc collaboration server\n");
});

const wss = new WebSocketServer({ server, maxPayload: 5 * 1024 * 1024 });

type HeartbeatSocket = WebSocket & { isAlive?: boolean; missedPongs?: number };
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    const socket = client as HeartbeatSocket;
    if (shouldTerminateHeartbeat(socket.missedPongs || 0)) {
      socket.terminate();
      return;
    }
    socket.missedPongs = nextHeartbeatMissCount(socket.missedPongs || 0);
    try { socket.ping(); } catch { socket.terminate(); }
  });
  liveConnections.forEach((connection) => {
    void validateConnectionSession(connection);
  });
}, websocketHeartbeatIntervalMs);
heartbeatTimer.unref();

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

function revokeLiveSession(sessionId: string) {
  liveConnections.forEach((connection) => {
    if (connection.sessionId !== sessionId || connection.closed || connection.expired) return;
    connection.expired = true;
    if (connection.ws.readyState === WebSocket.OPEN) connection.ws.close(4001, "Session revoked");
  });
}

async function validateConnectionSession(connection: Connection) {
  if (connection.closed || connection.expired || !connection.sessionId) return;
  const sessions = await prisma.$queryRaw<Array<{ revokedAt: Date | null; expiresAt: Date | null }>>`
    SELECT "revokedAt", "expiresAt" FROM "AppSession" WHERE "id" = ${connection.sessionId} LIMIT 1
  `.catch(() => []);
  const session = sessions[0];
  if (!session || session.revokedAt) {
    connection.expired = true;
    if (connection.ws.readyState === WebSocket.OPEN) connection.ws.close(4001, "Session revoked");
  }
}

function sessionIdFromToken(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof claims.session_id === "string" ? claims.session_id : undefined;
  } catch {
    return undefined;
  }
}

function isConnectionOrigin(origin: unknown): origin is Connection {
  return Boolean(origin && typeof origin === "object" && "ws" in origin);
}

function isRedisOrigin(origin: unknown): origin is RedisOrigin {
  return Boolean(origin && typeof origin === "object" && (origin as RedisOrigin).kind === "redis");
}

function sendSyncUpdate(documentId: string, update: Uint8Array, except?: WebSocket) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  connections.get(documentId)?.forEach(({ ws }) => {
    if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

function sendAwarenessUpdate(documentId: string, update: Uint8Array, except?: WebSocket) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, update);
  const message = encoding.toUint8Array(encoder);
  connections.get(documentId)?.forEach(({ ws }) => {
    if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

function transportDecode(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error("Invalid collaboration bus payload");
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function flushRedisUpdates(room: ActiveRoom) {
  if (room.redisUpdateTimer) clearTimeout(room.redisUpdateTimer);
  room.redisUpdateTimer = undefined;
  const updates = room.redisUpdates.splice(0);
  if (!updates.length) return;
  const update = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
  const published = await collaborationBus.publish({ version: 1, id: randomUUID(), sender: instanceId, documentId: room.roomId, kind: "yjs-update", data: Buffer.from(update).toString("base64") });
  if (!published && collaborationBus.status !== "disabled") console.warn("Redis Yjs update was not published", room.roomId);
}

function scheduleRedisUpdate(room: ActiveRoom, update: Uint8Array) {
  room.redisUpdates.push(update);
  if (room.redisUpdateTimer) clearTimeout(room.redisUpdateTimer);
  room.redisUpdateTimer = setTimeout(() => { flushRedisUpdates(room).catch((error) => console.error("Redis Yjs update failed", error)); }, redisBatchMs);
  room.redisUpdateTimer.unref();
}

async function subscribeRoom(room: ActiveRoom) {
  try {
    room.redisUnsubscribe = await collaborationBus.subscribe(room.roomId, (message: CollaborationBusMessage) => {
      if (message.sender === instanceId || message.documentId !== room.roomId) return;
      try {
        const update = transportDecode(message.data);
        if (message.kind === "yjs-update") Y.applyUpdate(room.doc, update, { kind: "redis", id: message.id, sender: message.sender } satisfies RedisOrigin);
        else awarenessProtocol.applyAwarenessUpdate(room.awareness, update, { kind: "redis", id: message.id, sender: message.sender } satisfies RedisOrigin);
      } catch (error) {
        console.error("Invalid collaboration bus update", room.roomId, error instanceof Error ? error.message : error);
      }
    });
  } catch (error) {
    console.error("Redis room subscription failed", room.roomId, error instanceof Error ? error.message : error);
  }
}

async function cleanupEmptyRoom(documentId: string) {
  const room = active.get(documentId);
  if (!room || connections.get(documentId)?.size || room.cleanupPromise) return room?.cleanupPromise;
  room.cleanupPromise = (async () => {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    if (room.versionTimer) clearTimeout(room.versionTimer);
    if (room.persistRetryTimer) clearTimeout(room.persistRetryTimer);
    if (room.redisUpdateTimer) clearTimeout(room.redisUpdateTimer);
    await flushRedisUpdates(room).catch((error) => console.error("Final Redis update failed", error));
    if (room.persistPromise || room.revision > room.persistedRevision || room.pendingRequests.length) await persist(documentId, true).catch((error) => console.error("Final Yjs persistence failed", error));
    room.pendingRequests = room.pendingRequests.filter((request) => !request.connection.closed && request.connection.ws.readyState === WebSocket.OPEN);
    const current = active.get(documentId);
    if (current !== room || connections.get(documentId)?.size) return;
    active.delete(documentId);
    connections.delete(documentId);
    const unsubscribe = room.redisUnsubscribe;
    if (unsubscribe) await unsubscribe().catch((error) => console.error("Redis room unsubscribe failed", error));
  })().finally(() => { room.cleanupPromise = undefined; });
  return room.cleanupPromise;
}

async function expireConnection(documentId: string, connection: Connection) {
  if (connection.closed || connection.expired) return;
  connection.expired = true;
  let persisted = false;
  for (let attempt = 0; attempt < 3 && !persisted; attempt += 1) {
    try {
      await persist(documentId, true);
      persisted = true;
    } catch (error) {
      console.error("Failed to persist document before invitation expiry", documentId, error);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (connection.ws.readyState === WebSocket.OPEN) {
    sendApplication(connection.ws, { kind: "access-expired", persisted });
    connection.ws.close(4003, "Invitation access expired");
  }
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
        const title = checkpoint?.title?.trim() || room.title;
        const contentHash = documentContentHash(title, content);
        const existing = await prisma.documentVersion.findUnique({ where: { documentId_contentHash: { documentId, contentHash } }, select: { id:true, versionNumber:true } });
        if (!existing) await prisma.documentVersion.create({ data: { documentId, title, content, versionNumber: await allocateDocumentVersionNumber(prisma, documentId), changeDescription: checkpoint?.description || (forceVersion ? "Collaborative session snapshot" : "Automatic checkpoint"), source: checkpoint?.source || (forceVersion ? "session-close" : "automatic"), contentHash, contributors: Array.from(new Set([room.lastEditorId || room.ownerId, ...requests.map((request) => request.connection.userId)])), createdBy: room.lastEditorId || room.ownerId } });
        room.versionRevision = revision;
        room.lastVersionAt = Date.now();
        room.changeStartedAt = undefined;
      } catch (error) {
        console.error("Yjs version snapshot failed", error);
      }
    }
    room.persistedRevision = revision;
    const persistedAt = new Date().toISOString();
    room.pendingRequests = room.pendingRequests.filter((request) => request.revision > revision);
    requests.forEach((request) => {
      room.acknowledgedMarkers.set(request.markerId, { revision, persistedAt });
      if (request.connection.ws.readyState === WebSocket.OPEN) sendApplication(request.connection.ws, { kind:"persisted", markerId:request.markerId, sequence:request.sequence, revision, persistedAt });
    });
    room.persistRetryAttempt = 0;
    if (room.persistRetryTimer) clearTimeout(room.persistRetryTimer);
    room.persistRetryTimer = undefined;
  })();
  room.persistPromise = operation;
  try {
    await operation;
  } catch (error) {
    requests.forEach((request) => {
      if (request.connection.ws.readyState === WebSocket.OPEN) sendApplication(request.connection.ws, { kind:"persist-failed", markerId:request.markerId, sequence:request.sequence, code:"PERSISTENCE_FAILED" });
    });
    room.persistRetryAttempt = (room.persistRetryAttempt || 0) + 1;
    if (!room.persistRetryTimer) {
      const delay = Math.min(30_000, 2_000 * 2 ** Math.min(room.persistRetryAttempt - 1, 4));
      room.persistRetryTimer = setTimeout(() => { room.persistRetryTimer = undefined; void persist(documentId).catch((retryError) => console.error("Yjs persistence retry failed", retryError)); }, delay);
      room.persistRetryTimer.unref();
    }
    throw error;
  } finally { if (room.persistPromise === operation) room.persistPromise = undefined; }

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
    const room:ActiveRoom = { doc, awareness, roomId: document.id, ownerId: document.userId, title:document.title, revision:0, persistedRevision:0, pendingRequests:[], acknowledgedMarkers:new Map(), redisUpdates:[] };
    active.set(documentId, room);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      room.revision += 1;
      const editor = Array.from(connections.get(documentId) || []).find(({ ws }) => ws === origin);
      if (editor) room.lastEditorId = editor.userId;
      schedulePersist(documentId);
      room.changeStartedAt ||= Date.now();
      scheduleVersion(documentId);
      if (!isRedisOrigin(origin)) scheduleRedisUpdate(room, update);
      sendSyncUpdate(documentId, update, isConnectionOrigin(origin) ? origin.ws : undefined);
    });
    awareness.on("update", ({added,updated,removed}:{added:number[];updated:number[];removed:number[]}, origin:unknown) => {
      const changed=[...added,...updated,...removed];
      const connection=isConnectionOrigin(origin) ? origin : undefined;
      if(connection?.awarenessIds){added.concat(updated).forEach((id)=>connection.awarenessIds.add(id));removed.forEach((id)=>connection.awarenessIds.delete(id));}
      if(!changed.length)return;
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
      if (!isRedisOrigin(origin)) void collaborationBus.publish({ version: 1, id: randomUUID(), sender: instanceId, documentId, kind: "awareness", data: Buffer.from(update).toString("base64") });
      sendAwarenessUpdate(documentId, update, connection?.ws);
    });
    await subscribeRoom(room);
    return room;
  })();
  loadingRooms.set(documentId, promise);
  try { return await promise; } finally { if (loadingRooms.get(documentId) === promise) loadingRooms.delete(documentId); }
}

wss.on("connection", async (ws, request) => {
  const socket = ws as HeartbeatSocket;
  socket.isAlive = true;
  socket.missedPongs = 0;
  ws.on("pong", () => { socket.isAlive = true; socket.missedPongs = resetHeartbeat(); });
  let closedBeforeSetup = false;
  let closeHandler = () => { closedBeforeSetup = true; };
  ws.once("close", closeHandler);
  ws.on("error", (error) => {
    console.error("WebSocket error", error instanceof Error ? error.message : error);
    closeHandler();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1011, "WebSocket error");
  });

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const origin = request.headers.origin;
  const expectedOrigin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (origin && expectedOrigin && origin !== expectedOrigin) return ws.close(1008, "Origin not allowed");
  const documentId = url.pathname.split("/").filter(Boolean).pop();
  const token = url.searchParams.get("token");
  if (!documentId || !token) return ws.close(1008, "Authentication required");

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (closedBeforeSetup || ws.readyState !== WebSocket.OPEN) return;
  if (authError || !user) return ws.close(1008, "Invalid session");
  const sessionId = sessionIdFromToken(token);
  if (sessionId) {
    const session = await prisma.$queryRaw<Array<{ revokedAt: Date | null; expiresAt: Date | null }>>`
      SELECT "revokedAt", "expiresAt" FROM "AppSession" WHERE "id" = ${sessionId} LIMIT 1
    `;
    if (session[0]?.revokedAt) return ws.close(1008, "Session revoked");
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(user.id) },
    select: { id: true, userId:true, collaborators:{where:activeCollaboratorWhere(user.id),select:{role:true,accessExpiresAt:true}} },
  });
  if (closedBeforeSetup || ws.readyState !== WebSocket.OPEN) return;
  if (!document) return ws.close(1008, "Document access denied");
  try {
    const redis = getRedisClient();
    const status = redis ? await collaborationSessionStatus(redis, documentId) : null;
    // Promotion is the authoritative hand-off. The independently counted
    // presence records can briefly lag the state transition, so requiring the
    // count here rejects both valid clients during the exact moment they are
    // connecting and sends y-websocket into a reconnect storm.
    if (!status || status.mode !== "realtime") return ws.close(4004, "Live collaboration is not active");
  } catch (error) {
    console.error("Collaboration session check failed", error instanceof Error ? error.message : error);
    return ws.close(4004, "Live collaboration is unavailable");
  }

  const room = await loadRoom(documentId);
  if (closedBeforeSetup || ws.readyState !== WebSocket.OPEN) { await cleanupEmptyRoom(documentId); return; }
  if (!room) return ws.close(1008, "Document not found");
  const role=document.userId===user.id?"owner":document.collaborators[0]?.role;
  const accessExpiresAt=document.userId===user.id?null:document.collaborators[0]?.accessExpiresAt;
  const entry:Connection = { ws, userId: user.id, sessionId, canEdit:role!=="viewer", awarenessIds:new Set(), accessExpiresAt };
  ws.off("close", closeHandler);
  closeHandler = () => {
    if (entry.closed) return;
    entry.closed = true;
    if (entry.expiryTimer) clearTimeout(entry.expiryTimer);
    awarenessProtocol.removeAwarenessStates(room.awareness,Array.from(entry.awarenessIds),entry);
    connections.get(documentId)?.delete(entry);
    liveConnections.delete(entry);
    void cleanupEmptyRoom(documentId);
  };
  ws.on("close", closeHandler);
  if (!connections.has(documentId)) connections.set(documentId, new Set());
  connections.get(documentId)!.add(entry);
  liveConnections.add(entry);
  if (accessExpiresAt) {
    const delay = Math.max(0, accessExpiresAt.getTime() - Date.now());
    entry.expiryTimer = setTimeout(() => { void expireConnection(documentId, entry); }, delay);
    entry.expiryTimer.unref();
  }

  const initial = encoding.createEncoder();
  encoding.writeVarUint(initial, messageSync);
  syncProtocol.writeSyncStep1(initial, room.doc);
  if (ws.readyState === WebSocket.OPEN) ws.send(encoding.toUint8Array(initial));
  const existingIds=Array.from(room.awareness.getStates().keys());
  if(existingIds.length && ws.readyState === WebSocket.OPEN){const awareness=encoding.createEncoder();encoding.writeVarUint(awareness,messageAwareness);encoding.writeVarUint8Array(awareness,awarenessProtocol.encodeAwarenessUpdate(room.awareness,existingIds));ws.send(encoding.toUint8Array(awareness));}

  ws.on("message", (raw, isBinary) => {
    if (entry.closed || entry.expired || ws.readyState !== WebSocket.OPEN || !isBinary || typeof raw === "string") return;
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
        const payload = JSON.parse(decoding.readVarString(decoder)) as { kind?:string; markerId?:string; clientId?:string; sequence?:number; checkpoint?:PersistCheckpoint };
        const sequence = payload.sequence;
        if (payload.kind !== "persist-request" || typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0 || (payload.checkpoint && !entry.canEdit)) return;
        const markerId = typeof payload.markerId === "string" ? payload.markerId : `legacy:${entry.userId}:${sequence}`;
        const clientId = typeof payload.clientId === "string" ? payload.clientId : `legacy:${entry.userId}`;
        const previous = room.acknowledgedMarkers.get(markerId);
        if (previous) {
          if (ws.readyState === WebSocket.OPEN) sendApplication(ws, { kind:"persisted", markerId, sequence, revision:previous.revision, persistedAt:previous.persistedAt });
          return;
        }
        const duplicate = room.pendingRequests.find((request) => request.markerId === markerId);
        if (duplicate) { duplicate.connection = entry; return; }
        if (room.revision === room.persistedRevision && !payload.checkpoint) {
          const persistedAt = new Date().toISOString();
          room.acknowledgedMarkers.set(markerId, { revision:room.persistedRevision, persistedAt });
          sendApplication(ws, { kind:"persisted", markerId, sequence, revision:room.persistedRevision, persistedAt });
          return;
        }
        room.pendingRequests.push({ connection:entry, markerId, clientId, sequence, revision:room.revision, checkpoint:payload.checkpoint });
        if (payload.checkpoint) room.snapshotRequested = true;
        void persist(documentId);
      }
    } catch (error) {
      console.error("Invalid collaboration message", error instanceof Error ? error.message : error);
      ws.close(1003, "Invalid collaboration message");
    }
  });

});

const shutdown = async () => {
  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);
  for (const documentId of active.keys()) await persist(documentId).catch(console.error);
  await Promise.all(Array.from(active.keys()).map((documentId) => cleanupEmptyRoom(documentId)));
  await collaborationBus.close();
  wss.clients.forEach((client) => client.close(1001, "Server restarting"));
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};

void collaborationBus.subscribeSessionRevocations(revokeLiveSession).catch((error) => {
  console.error("Redis session revocation subscription failed", error instanceof Error ? error.message : error);
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
const cleanupTimer = setInterval(() => { cleanupOrphanImages().catch((error) => console.error("Orphan image cleanup failed", error)); }, orphanCleanupIntervalMs);
cleanupTimer.unref();
server.listen(PORT, HOST, () => {
  console.log(`Omnidoc WebSocket server listening on ${HOST}:${PORT}`);
  cleanupOrphanImages().catch((error) => console.error("Initial orphan image cleanup failed", error));
});
