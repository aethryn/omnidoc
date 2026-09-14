"use client";

import { forwardRef, useImperativeHandle, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { GhostSuggestionExtension, ghostSuggestionKey } from "./ghost-suggestion-extension";
import type { EditorHandle, EditorSuggestion, FormatCommand } from "./editor-types";
import "./editor-styles.css";

export interface LocalEditorProps { initialContent?: string; onContentChange?: (json: string) => void; documentId?: string; readOnly?: boolean; }

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

const Editor = forwardRef<EditorHandle, LocalEditorProps>(function Editor({ initialContent, onContentChange, documentId, readOnly }, ref) {
  const content = useMemo(() => parseContent(initialContent), [initialContent]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline, Link.configure({ openOnClick:false }), Image, TextAlign.configure({ types:["heading","paragraph"] }), Highlight.configure({ multicolor:true }), Placeholder.configure({ placeholder:"Start with a thought…" }), GhostSuggestionExtension],
    content,
    editable: !readOnly,
    editorProps: { attributes: { class:"notion-editor focus:outline-none min-h-[520px]" } },
    onUpdate: ({ editor: instance }) => onContentChange?.(JSON.stringify(instance.getJSON())),
  });

  useImperativeHandle(ref, () => ({
    getDocumentJSON: () => editor ? JSON.stringify(editor.getJSON()) : JSON.stringify(content),
    getPlainText: () => editor?.getText() ?? "",
    getSelection: () => {
      if (!editor) return { from:0, to:0, text:"" };
      const { from, to } = editor.state.selection;
      return { from, to, text:editor.state.doc.textBetween(from, to, " ") };
    },
    previewSuggestion: (change: EditorSuggestion) => editor?.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey, { set:change })),
    applySuggestion: (change: EditorSuggestion) => {
      if (!editor || readOnly) return false;
      const current = editor.state.doc.textBetween(change.from, change.to, " ");
      if (current !== change.originalText) return false;
      editor.view.dispatch(editor.state.tr.insertText(change.text, change.from, change.to).setMeta(ghostSuggestionKey, { clear:change.id }));
      editor.commands.focus();
      return true;
    },
    dismissSuggestion: (id: string) => editor?.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey, { clear:id })),
    runFormat: (command) => { if (editor && !readOnly) runFormat(editor, command); },
  }), [content, editor, readOnly]);

  if (!editor) return <div className="min-h-[520px]" />;
  return <div className="w-full max-w-5xl mx-auto light"><div className="rounded-xl !bg-white overflow-hidden" style={{ colorScheme:"light" }}>{!readOnly && <EditorBubbleMenu editor={editor} documentId={documentId} />}<EditorContent editor={editor} className="!bg-white" /></div></div>;
});

export default Editor;
