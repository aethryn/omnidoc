"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { createClient } from "@/lib/supabase/client";
import { EditorBubbleMenu } from "../document/EditorBubbleMenu";
import { GhostSuggestionExtension, ghostSuggestionKey } from "../document/ghost-suggestion-extension";
import type { EditorHandle, EditorSuggestion, FormatCommand, PresenceUser } from "../document/editor-types";
import "../document/editor-styles.css";
import { InteractiveImage } from "../document/InteractiveImage";
import { uploadAndInsertImage } from "../document/image-upload";
import { LinkPreviewCard } from "../document/LinkPreviewCard";
import { CommentThreadExtension } from "../document/comment-thread-extension";

export type CollaborationStatus = "local" | "connecting" | "synced" | "offline" | "error";
export type CollaborationState = { connectivity: "connecting" | "online" | "offline" | "error"; indexedDbReady: boolean; pendingLocalChanges: boolean; lastPersistedAt: string | null };
interface Props { documentId: string; initialState?: string | null; readOnly?: boolean; user: PresenceUser; onStatusChange?: (status: CollaborationStatus) => void; onStateChange?: (state: CollaborationState) => void; onPresenceChange?: (users: PresenceUser[]) => void; onContentChange?: (content:string) => void; }

function decodeState(value: string) { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
function runFormat(editor: NonNullable<ReturnType<typeof useEditor>>, command: FormatCommand) {
  const chain = editor.chain().focus();
  if (command === "paragraph") chain.setParagraph().run();
  if (command === "bold") chain.toggleBold().run();
  if (command === "italic") chain.toggleItalic().run();
  if (command === "underline") chain.toggleUnderline().run();
  if (command === "align-left") chain.setTextAlign("left").run();
  if (command === "bullet-list") chain.toggleBulletList().run();
}

const CollaborativeEditor = forwardRef<EditorHandle, Props>(function CollaborativeEditor({ documentId, initialState, readOnly, user, onStatusChange, onStateChange, onPresenceChange, onContentChange }, ref) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const onPresenceChangeRef = useRef(onPresenceChange);
  const onContentChangeRef = useRef(onContentChange);
  const onStateChangeRef = useRef(onStateChange);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const stateRef = useRef<CollaborationState>({ connectivity:"connecting", indexedDbReady:false, pendingLocalChanges:false, lastPersistedAt:null });
  const pendingSequencesRef = useRef(new Set<number>());
  const pendingMessagesRef = useRef(new Map<number, { kind:string; sequence:number; checkpoint?: { description:string; title?:string; source?:string } }>());
  const pendingCheckpointsRef = useRef(new Map<number, (ok:boolean)=>void>());
  const sequenceRef = useRef(0);
  const markerTimerRef = useRef<number | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);

  onStatusChangeRef.current = onStatusChange;
  onPresenceChangeRef.current = onPresenceChange;
  onContentChangeRef.current = onContentChange;
  onStateChangeRef.current = onStateChange;

  function updateState(patch: Partial<CollaborationState>) {
    stateRef.current = { ...stateRef.current, ...patch };
    onStateChangeRef.current?.(stateRef.current);
  }

  function sendAppMessage(provider: WebsocketProvider, payload: { kind:string; sequence:number; checkpoint?: { description:string; title?:string; source?:string } }) {
    if (!provider.ws || provider.ws.readyState !== WebSocket.OPEN) return false;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 4);
    encoding.writeVarString(encoder, JSON.stringify(payload));
    provider.ws.send(encoding.toUint8Array(encoder));
    return true;
  }

  function flushMarkers() {
    const provider = providerRef.current;
    if (!provider?.ws || provider.ws.readyState !== WebSocket.OPEN) return;
    pendingSequencesRef.current.forEach((sequence) => sendAppMessage(provider, pendingMessagesRef.current.get(sequence) || { kind:"persist-request", sequence }));
  }

  useEffect(() => {
    if (initialState) { try { Y.applyUpdate(ydoc, decodeState(initialState)); } catch { /* IndexedDB can still recover the page. */ } }
    const persistence = new IndexeddbPersistence(`omnidoc:${documentId}`, ydoc);
    persistenceRef.current = persistence;
    persistence.on("synced", () => updateState({ indexedDbReady:true }));
    return () => { persistenceRef.current = null; persistence.destroy(); };
  }, [documentId, initialState, ydoc]);

  useEffect(() => {
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === providerRef.current || origin === persistenceRef.current) return;
      const sequence = ++sequenceRef.current;
      pendingSequencesRef.current.add(sequence);
      pendingMessagesRef.current.set(sequence, { kind:"persist-request", sequence });
      updateState({ pendingLocalChanges:true });
      if (markerTimerRef.current != null) window.clearTimeout(markerTimerRef.current);
      markerTimerRef.current = window.setTimeout(flushMarkers, 0);
    };
    ydoc.on("update", onUpdate);
    return () => { ydoc.off("update", onUpdate); if (markerTimerRef.current != null) window.clearTimeout(markerTimerRef.current); };
  }, [ydoc]);

  useEffect(() => {
    let disposed = false;
    let nextProvider: WebsocketProvider | null = null;
    createClient().auth.getSession().then(({ data }) => {
      if (disposed || !data.session) { if (!disposed) updateState({ connectivity:"error" }); return; }
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
      if (!wsUrl) { updateState({ connectivity:"offline" }); onStatusChangeRef.current?.("offline"); return; }
      nextProvider = new WebsocketProvider(wsUrl, documentId, ydoc, { params:{ token:data.session.access_token }, connect:true });
      providerRef.current = nextProvider;
      nextProvider.awareness.setLocalStateField("user", user);
      const publishPresence = () => {
        const users = Array.from(nextProvider!.awareness.getStates().values()).map((state) => state.user).filter(Boolean) as PresenceUser[];
        onPresenceChangeRef.current?.(users);
      };
      nextProvider.awareness.on("change", publishPresence);
      nextProvider.on("status", ({ status }) => { const next = status === "connected" ? "online" : status === "connecting" ? "connecting" : "offline"; updateState({ connectivity:next }); onStatusChangeRef.current?.(next === "online" ? "synced" : next === "connecting" ? "connecting" : "offline"); if (next === "online") flushMarkers(); });
      nextProvider.on("connection-error", () => { updateState({ connectivity:"error" }); onStatusChangeRef.current?.("error"); });
      nextProvider.on("sync", (synced) => { if (synced) flushMarkers(); });
      nextProvider.messageHandlers.push((_encoder, decoder, _provider, _isBc, messageType) => {
        if (messageType !== 4) return;
        try {
          const payload = JSON.parse(decoding.readVarString(decoder)) as { kind?:string; sequence?:number; persistedAt?:string };
          if (payload.kind !== "persisted" || typeof payload.sequence !== "number") return;
          pendingSequencesRef.current.delete(payload.sequence);
          pendingMessagesRef.current.delete(payload.sequence);
          pendingCheckpointsRef.current.get(payload.sequence)?.(true);
          pendingCheckpointsRef.current.delete(payload.sequence);
          updateState({ pendingLocalChanges:pendingSequencesRef.current.size > 0, lastPersistedAt:payload.persistedAt || new Date().toISOString() });
        } catch { /* Ignore malformed application messages. */ }
      });
      setProvider(nextProvider);
      publishPresence();
    }).catch(() => { if (!disposed) { updateState({ connectivity:"error" }); onStatusChangeRef.current?.("error"); } });
    return () => { disposed = true; providerRef.current = null; nextProvider?.destroy(); };
  }, [documentId, user, ydoc]);

  const editor = useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({ history:false }), Underline, Link.configure({ openOnClick:false, autolink:true, linkOnPaste:true, validate:(href) => /^https?:\/\//i.test(href) }), CommentThreadExtension, InteractiveImage.configure({ documentId, getDocumentId: () => Promise.resolve(documentId), editable: !readOnly }), TextAlign.configure({ types:["heading","paragraph"] }), Highlight.configure({ multicolor:true }), Placeholder.configure({ placeholder:"Start writing…" }), GhostSuggestionExtension, Collaboration.configure({ document:ydoc, field:"default" }), ...(provider ? [CollaborationCursor.configure({ provider, user })] : [])],
    editable:!readOnly,
    onUpdate:({editor:instance})=>onContentChangeRef.current?.(JSON.stringify(instance.getJSON())),
    editorProps:{
      attributes:{ class:"notion-editor focus:outline-none min-h-[520px]" },
      handlePaste(view,event){const file=Array.from(event.clipboardData?.files||[]).find((item)=>item.type.startsWith("image/"));if(!file||readOnly)return false;void uploadAndInsertImage(file,()=>Promise.resolve(documentId),(image)=>view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({src:image.fileUrl,alt:image.originalName||"",width:100,align:"center"}))));return true;},
      handleDrop(view,event){const file=Array.from(event.dataTransfer?.files||[]).find((item)=>item.type.startsWith("image/"));if(!file||readOnly)return false;event.preventDefault();const position=view.posAtCoords({left:event.clientX,top:event.clientY})?.pos;void uploadAndInsertImage(file,()=>Promise.resolve(documentId),(image)=>{const node=view.state.schema.nodes.image.create({src:image.fileUrl,alt:image.originalName||"",width:100,align:"center"});view.dispatch(position==null?view.state.tr.replaceSelectionWith(node):view.state.tr.insert(position,node));});return true;},
    },
  // The provider is the only dependency that needs to recreate the editor. The
  // parent receives an update on every keystroke, so including its callback (or
  // parent state) here would destroy and recreate the editor on every update.
  }, [provider]);

  useImperativeHandle(ref, () => ({
    getDocumentJSON:() => editor ? JSON.stringify(editor.getJSON()) : JSON.stringify({ type:"doc", content:[] }),
    getPlainText:() => editor?.getText() ?? "",
    getSelection:() => { if (!editor) return {from:0,to:0,text:""}; const {from,to}=editor.state.selection; return {from,to,text:editor.state.doc.textBetween(from,to," ")}; },
    previewSuggestion:(change:EditorSuggestion) => editor?.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey,{set:change})),
    applySuggestion:(change:EditorSuggestion) => { if(!editor||readOnly)return false; const current=editor.state.doc.textBetween(change.from,change.to," "); if(current!==change.originalText)return false; editor.view.dispatch(editor.state.tr.insertText(change.text,change.from,change.to).setMeta(ghostSuggestionKey,{clear:change.id})); editor.commands.focus(); return true; },
    dismissSuggestion:(id:string) => editor?.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey,{clear:id})),
    runFormat:(command) => { if(editor&&!readOnly)runFormat(editor,command); },
    addCommentMark: (threadId, from, to) => { if (editor && !readOnly && to > from) editor.chain().focus().setTextSelection({ from, to }).setMark("commentThread", { threadId }).run(); },
    replaceDocument: (value) => { if (!editor || readOnly) return false; try { editor.commands.setContent(JSON.parse(value)); return true; } catch { return false; } },
    createCheckpoint: async (description, title) => {
      if (!provider?.ws || provider.ws.readyState !== WebSocket.OPEN || !editor) return false;
      const sequence = ++sequenceRef.current;
      pendingSequencesRef.current.add(sequence);
      pendingMessagesRef.current.set(sequence, { kind:"persist-request", sequence, checkpoint:{ description, title: title || undefined, source:"manual" } });
      updateState({ pendingLocalChanges:true });
      const acknowledged = new Promise<boolean>((resolve) => pendingCheckpointsRef.current.set(sequence, resolve));
      if (!sendAppMessage(provider, { kind:"persist-request", sequence, checkpoint:{ description, title: title || undefined, source:"manual" } })) { pendingCheckpointsRef.current.delete(sequence); pendingMessagesRef.current.delete(sequence); pendingSequencesRef.current.delete(sequence); return false; }
      return Promise.race([acknowledged, new Promise<boolean>((resolve) => window.setTimeout(() => { pendingCheckpointsRef.current.delete(sequence); resolve(false); }, 15000))]);
    },
  }),[editor,readOnly]);

  if(!editor)return <div className="min-h-[520px]" />;
  return <>{!readOnly&&<EditorBubbleMenu editor={editor} documentId={documentId} ensureDocumentId={()=>Promise.resolve(documentId)}/>}<EditorContent editor={editor}/><LinkPreviewCard editor={editor}/></>;
});

export default CollaborativeEditor;
