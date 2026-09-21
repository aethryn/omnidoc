import { NextRequest, NextResponse } from "next/server";
import * as Y from "yjs";
import { createAuthErrorResponse, documentAccessWhere, getCurrentUserIdFromRequest } from "@/lib/auth";
import { contentToYDoc, yDocToContent } from "@/lib/document-yjs";
import { deriveDocumentPreview } from "@/lib/document-content";
import { demoteCollaborationSession, promoteCollaborationSession, touchCollaborationSession } from "@/lib/collaboration-session";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

const sessionIdPattern = /^[A-Za-z0-9_-]{16,160}$/;

async function authorizedDocument(request: NextRequest, id: string, editable = false) {
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return { error: createAuthErrorResponse(auth) };
  const document = await prisma.document.findFirst({
    where: { id, ...documentAccessWhere(auth.userId, editable ? ["admin", "editor"] : undefined) },
    select: { id: true, content: true, yjsState: true },
  });
  if (!document) return { error: NextResponse.json({ error: "Document not found or access denied" }, { status: 404 }) };
  return { auth, document };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const sessionId = typeof body.sessionId === "string" && sessionIdPattern.test(body.sessionId) ? body.sessionId : null;
  if (!sessionId && action !== "demote") return NextResponse.json({ error: "A valid browser session is required" }, { status: 400 });

  const editable = action === "promote";
  const result = await authorizedDocument(request, id, editable);
  if ("error" in result) return result.error;
  const redis = getRedisClient();
  if (!redis) return NextResponse.json({ error: "Live collaboration is unavailable", code: "COLLABORATION_UNAVAILABLE" }, { status: 503 });

  try {
    if (action === "heartbeat" || action === "leave") {
      const status = await touchCollaborationSession(redis, id, sessionId!, action);
      // Documents made by the old always-WebSocket client retain yjsState. Once
      // they are safely solo again, return them to REST ownership.
      if (status.mode === "local" && result.document.yjsState) {
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, new Uint8Array(result.document.yjsState));
        const content = yDocToContent(ydoc);
        await prisma.document.update({ where: { id }, data: { yjsState: null, content, ...deriveDocumentPreview(content), lastEditedAt: new Date() } });
      }
      return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "promote") {
      const status = await touchCollaborationSession(redis, id, sessionId!, "heartbeat");
      if (status.mode !== "activating" || status.leaderId !== sessionId) return NextResponse.json(status, { status: 409 });
      // The leader flushes REST content immediately before this call. Re-read
      // after that flush so the Yjs baseline cannot be built from stale data.
      const current = await prisma.document.findUnique({ where: { id }, select: { content: true } });
      if (!current) return NextResponse.json({ error: "Document not found" }, { status: 404 });
      const ydoc = contentToYDoc(current.content);
      const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
      await prisma.document.update({ where: { id }, data: { yjsState: state } });
      const promoted = await promoteCollaborationSession(redis, id, sessionId!);
      if (!promoted.promoted) return NextResponse.json(promoted, { status: 409 });
      return NextResponse.json({ ...promoted, yjsState: state.toString("base64") });
    }

    if (action === "demote") {
      const demoted = await demoteCollaborationSession(redis, id);
      if (!demoted.demoted) return NextResponse.json(demoted, { status: 409 });
      const current = await prisma.document.findUnique({ where: { id }, select: { yjsState: true, content: true } });
      let content = current?.content || result.document.content;
      if (current?.yjsState) {
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, new Uint8Array(current.yjsState));
        content = yDocToContent(ydoc);
      }
      await prisma.document.update({ where: { id }, data: { yjsState: null, content, ...deriveDocumentPreview(content), lastEditedAt: new Date() } });
      return NextResponse.json(demoted);
    }
    return NextResponse.json({ error: "Unsupported collaboration action" }, { status: 400 });
  } catch (error) {
    console.error("Collaboration coordination failed", error);
    return NextResponse.json({ error: "Live collaboration is unavailable", code: "COLLABORATION_UNAVAILABLE" }, { status: 503 });
  }
}
