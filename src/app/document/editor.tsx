"use client";

import { forwardRef, useImperativeHandle, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { GhostSuggestionExtension, ghostSuggestionKey } from "./ghost-suggestion-extension";
import { resolveBlockRange, type EditorHandle, type EditorSuggestion, type FormatCommand } from "./editor-types";
import "./editor-styles.css";
import { InteractiveImage } from "./InteractiveImage";
import { uploadAndInsertImage } from "./image-upload";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { CommentThreadExtension } from "./comment-thread-extension";
import { DocumentTextSkeleton } from "@/components/document-loading-skeletons";
import { looksLikeMarkdown, markdownToTiptap } from "@/lib/markdown-to-tiptap";
import type { EditorEditSnapshot } from "./editor-types";
import { Fragment, Slice } from "@tiptap/pm/model";

export interface LocalEditorProps { initialContent?: string; onContentChange?: (json: string) => void; documentId?: string; ensureDocumentId?: () => Promise<string | null>; readOnly?: boolean; }

function parseContent(value?: string) {
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };
  try { return JSON.parse(value); } catch { return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] }; }
}

function runFormat(editor: NonNullable<ReturnType<typeof useEditor>>, command: FormatCommand) {
  const chain = editor.chain().focus();
  if (command === "paragraph") chain.setParagraph().run();
  if (command === "bold") chain.toggleBold().run();
  if (command === "italic") chain.toggleItalic().run();
  if (command === "underline") chain.toggleUnderline().run();
  if (command === "align-left") chain.setTextAlign("left").run();
  if (command === "bullet-list") chain.toggleBulletList().run();
}

const Editor = forwardRef<EditorHandle, LocalEditorProps>(function Editor({ initialContent, onContentChange, documentId, ensureDocumentId, readOnly }, ref) {
  const content = useMemo(() => parseContent(initialContent), [initialContent]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline, Link.configure({ openOnClick:false, autolink:true, linkOnPaste:true, validate:(href) => /^https?:\/\//i.test(href) }), CommentThreadExtension, InteractiveImage.configure({ documentId, getDocumentId: ensureDocumentId, editable: !readOnly }), TextAlign.configure({ types:["heading","paragraph"] }), Highlight.configure({ multicolor:true }), Placeholder.configure({ placeholder:"Start with a thought…" }), GhostSuggestionExtension],
    content,
    editable: !readOnly,
    editorProps: {
      attributes: { class:"notion-editor focus:outline-none min-h-[520px]" },
      handlePaste(view, event) {
        const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith("image/"));
        if (file) {
          if (readOnly) return false;
          void uploadAndInsertImage(file, ensureDocumentId || (() => Promise.resolve(documentId || null)), (image) => view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src:image.fileUrl, alt:image.originalName || "", width:100, align:"center" }))));
          return true;
        }
        const text = event.clipboardData?.getData("text/plain") || "";
        const html = event.clipboardData?.getData("text/html") || "";
        if (!readOnly && text && !html && looksLikeMarkdown(text)) {
          event.preventDefault();
          const content = (markdownToTiptap(text).content || []).map((node) => view.state.schema.nodeFromJSON(node));
          view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(content), 0, 0)));
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));
        if (!file || readOnly) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left:event.clientX, top:event.clientY })?.pos;
        void uploadAndInsertImage(file, ensureDocumentId || (() => Promise.resolve(documentId || null)), (image) => { const node=view.state.schema.nodes.image.create({src:image.fileUrl,alt:image.originalName || "",width:100,align:"center"}); view.dispatch(position == null ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(position,node)); });
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => onContentChange?.(JSON.stringify(instance.getJSON())),
  });

  useImperativeHandle(ref, () => ({
    getDocumentJSON: () => editor ? JSON.stringify(editor.getJSON()) : JSON.stringify(content),
    getPlainText: () => editor?.getText() ?? "",
    getSelection: () => {
      if (!editor) return { from:0, to:0, text:"" };
      const { from, to } = editor.state.selection;
      return { from, to, text:editor.state.doc.textBetween(from, to, "\n") };
    },
    getEditSnapshot: (): EditorEditSnapshot => {
      if (!editor) return { documentJson: JSON.stringify(content), blocks:[], selection:{from:0,to:0,text:""}, caret:0 };
      const blocks: EditorEditSnapshot["blocks"] = [];
      editor.state.doc.forEach((node, offset, index) => blocks.push({ id:`block-${index}`, index, text:node.textContent, from:offset, to:offset + node.nodeSize }));
      const { from, to } = editor.state.selection;
      return { documentJson:JSON.stringify(editor.getJSON()), blocks, selection:{from,to,text:editor.state.doc.textBetween(from,to,"\n")}, caret:from };
    },
    previewSuggestion: (change: EditorSuggestion) => editor?.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey, { set:change })),
    applySuggestion: (change: EditorSuggestion) => {
      if (!editor || readOnly) return false;
      let from = change.from;
      let to = change.to;
      const current = editor.state.doc.textBetween(from, to, "\n");
      if (current !== change.originalText) {
        if (change.operation !== "replace-blocks" && change.operation !== "replace-document") return false;
        const blocks: EditorEditSnapshot["blocks"] = [];
        editor.state.doc.forEach((node, offset, index) => blocks.push({ id:`block-${index}`, index, text:node.textContent, from:offset, to:offset + node.nodeSize }));
        const resolved = resolveBlockRange(blocks, change.originalText);
        if (!resolved) return false;
        ({ from, to } = resolved);
      }
      if (change.kind === "delete") editor.commands.deleteRange({ from, to });
      else editor.commands.insertContentAt({ from, to }, markdownToTiptap(change.markdown ?? change.text).content || []);
      editor.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey, { clear:change.id }));
      editor.commands.focus();
      return true;
    },
    dismissSuggestion: (id: string) => editor?.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey, { clear:id })),
    runFormat: (command) => { if (editor && !readOnly) runFormat(editor, command); },
    insertImage: (image) => { if (!editor || readOnly) return false; editor.chain().focus().setImage({ src:image.fileUrl, alt:image.originalName || "", width:100, align:"center" } as never).run(); return true; },
    addCommentMark: (threadId, from, to) => { if (editor && !readOnly && to > from) editor.chain().focus().setTextSelection({ from, to }).setMark("commentThread", { threadId }).run(); },
    replaceDocument: (value) => { if (!editor || readOnly) return false; try { editor.commands.setContent(JSON.parse(value)); return true; } catch { return false; } },
    replaceMarkdown: (markdown, from, to) => { if (!editor || readOnly) return false; const start = from ?? 0; const end = to ?? editor.state.doc.content.size; return editor.commands.insertContentAt({ from:start, to:end }, markdownToTiptap(markdown).content || []); },
    retryPersistence: () => undefined,
    createCheckpoint: async (description, title) => { if (!documentId) return false; const response = await fetch(`/api/documents/${documentId}/versions`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ title, content: editor ? JSON.stringify(editor.getJSON()) : content, description }) }); return response.ok; },
  }), [content, editor, readOnly]);

  if (!editor) return <DocumentTextSkeleton />;
  return <div className="w-full max-w-5xl mx-auto light"><div className="rounded-xl !bg-white overflow-hidden" style={{ colorScheme:"light" }}>{!readOnly && <EditorBubbleMenu editor={editor} documentId={documentId} ensureDocumentId={ensureDocumentId} />}<EditorContent editor={editor} className="!bg-white" /><LinkPreviewCard editor={editor} /></div></div>;
});

export default Editor;
