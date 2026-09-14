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
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { createClient } from "@/lib/supabase/client";
import { EditorBubbleMenu } from "../document/EditorBubbleMenu";
import { GhostSuggestionExtension, ghostSuggestionKey } from "../document/ghost-suggestion-extension";
import type { EditorHandle, EditorSuggestion, FormatCommand, PresenceUser } from "../document/editor-types";
import "../document/editor-styles.css";
import { InteractiveImage } from "../document/InteractiveImage";
import { uploadAndInsertImage } from "../document/image-upload";

export type CollaborationStatus = "local" | "connecting" | "synced" | "offline" | "error";
interface Props { documentId: string; initialState?: string | null; readOnly?: boolean; user: PresenceUser; onStatusChange?: (status: CollaborationStatus) => void; onPresenceChange?: (users: PresenceUser[]) => void; onContentChange?: (content:string) => void; }

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

const CollaborativeEditor = forwardRef<EditorHandle, Props>(function CollaborativeEditor({ documentId, initialState, readOnly, user, onStatusChange, onPresenceChange, onContentChange }, ref) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const onPresenceChangeRef = useRef(onPresenceChange);
  const onContentChangeRef = useRef(onContentChange);

  onStatusChangeRef.current = onStatusChange;
  onPresenceChangeRef.current = onPresenceChange;
  onContentChangeRef.current = onContentChange;

  useEffect(() => {
    if (initialState) { try { Y.applyUpdate(ydoc, decodeState(initialState)); } catch { /* IndexedDB can still recover the page. */ } }
    const persistence = new IndexeddbPersistence(`omnidoc:${documentId}`, ydoc);
    persistence.on("synced", () => onStatusChangeRef.current?.("local"));
    return () => { persistence.destroy(); };
  }, [documentId, initialState, ydoc]);

  useEffect(() => {
    let disposed = false;
    let nextProvider: WebsocketProvider | null = null;
    createClient().auth.getSession().then(({ data }) => {
      if (disposed || !data.session) return;
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
      if (!wsUrl) { onStatusChangeRef.current?.("offline"); return; }
      nextProvider = new WebsocketProvider(wsUrl, documentId, ydoc, { params:{ token:data.session.access_token }, connect:true });
      nextProvider.awareness.setLocalStateField("user", user);
      const publishPresence = () => {
        const users = Array.from(nextProvider!.awareness.getStates().values()).map((state) => state.user).filter(Boolean) as PresenceUser[];
        onPresenceChangeRef.current?.(users);
      };
      nextProvider.awareness.on("change", publishPresence);
      nextProvider.on("status", ({ status }) => onStatusChangeRef.current?.(status === "connected" ? "connecting" : "offline"));
      nextProvider.on("sync", (synced) => onStatusChangeRef.current?.(synced ? "synced" : "connecting"));
      setProvider(nextProvider);
      publishPresence();
    }).catch(() => { if (!disposed) onStatusChangeRef.current?.("error"); });
    return () => { disposed = true; nextProvider?.destroy(); };
  }, [documentId, user, ydoc]);

  const editor = useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({ history:false }), Underline, Link.configure({ openOnClick:false }), InteractiveImage, TextAlign.configure({ types:["heading","paragraph"] }), Highlight.configure({ multicolor:true }), Placeholder.configure({ placeholder:"Start writing…" }), GhostSuggestionExtension, Collaboration.configure({ document:ydoc, field:"default" }), ...(provider ? [CollaborationCursor.configure({ provider, user })] : [])],
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
  }),[editor,readOnly]);

  if(!editor)return <div className="min-h-[520px]" />;
  return <>{!readOnly&&<EditorBubbleMenu editor={editor} documentId={documentId} ensureDocumentId={()=>Promise.resolve(documentId)}/>}<EditorContent editor={editor}/></>;
});

export default CollaborativeEditor;
