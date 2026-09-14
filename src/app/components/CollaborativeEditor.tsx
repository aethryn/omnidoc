"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "../document/editor-styles.css";
import { EditorBubbleMenu } from "../document/EditorBubbleMenu";

export type CollaborationStatus = "local" | "connecting" | "synced" | "offline" | "error";
interface Props { documentId: string; initialState?: string | null; readOnly?: boolean; onStatusChange?: (status: CollaborationStatus) => void; }

function decodeState(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export default function CollaborativeEditor({ documentId, initialState, readOnly, onStatusChange }: Props) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    if (initialState) { try { Y.applyUpdate(ydoc, decodeState(initialState)); } catch { /* local persistence can recover */ } }
    const persistence = new IndexeddbPersistence(`omnidoc:${documentId}`, ydoc);
    persistence.on("synced", () => onStatusChange?.("local"));
    return () => { persistence.destroy(); };
  }, [documentId, initialState, onStatusChange, ydoc]);

  useEffect(() => {
    let disposed = false;
    createClient().auth.getSession().then(({ data }) => {
      if (disposed || !data.session) return;
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
      if (!wsUrl) { onStatusChange?.("offline"); return; }
      const nextProvider = new WebsocketProvider(wsUrl, documentId, ydoc, { params: { token: data.session.access_token }, connect: true });
      nextProvider.on("status", ({ status }) => onStatusChange?.(status === "connected" ? "connecting" : status === "disconnected" ? "offline" : "connecting"));
      nextProvider.on("sync", (synced) => onStatusChange?.(synced ? "synced" : "connecting"));
      setProvider(nextProvider);
    });
    return () => { disposed = true; setProvider((current) => { current?.destroy(); return null; }); };
  }, [documentId, onStatusChange, ydoc]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Collaboration.configure({ document: ydoc, field: "default" }),
      ...(provider ? [CollaborationCursor.configure({ provider, user: { name: "Collaborator", color: "#2563eb" } })] : []),
    ],
    editable: !readOnly,
    editorProps: { attributes: { class: "notion-editor focus:outline-none px-8 py-6 min-h-[500px]" } },
  }, [provider, readOnly, ydoc]);

  if (!editor) return <div className="flex min-h-[500px] items-center justify-center text-sm text-slate-400">Preparing your document…</div>;
  return <><EditorBubbleMenu editor={editor} documentId={documentId} /><EditorContent editor={editor} /></>;
}
