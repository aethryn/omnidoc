import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TiptapTransformer } from "@hocuspocus/transformer";
import type * as Y from "yjs";

const extensions = [StarterKit, Underline, Link, Image, TextAlign.configure({types:["heading","paragraph"]}), Highlight.configure({multicolor:true})];
const empty: Record<string, unknown> = { type:"doc", content:[{type:"paragraph"}] };

export function contentToYDoc(content:string):Y.Doc{
  let json=empty;
  try{const parsed=JSON.parse(content);if(parsed?.type==="doc")json=parsed;}catch{/* legacy plain text is handled as a paragraph */if(content.trim())json={type:"doc",content:[{type:"paragraph",content:[{type:"text",text:content}]}]};}
  return TiptapTransformer.toYdoc(json,"default",extensions);
}

export function yDocToContent(doc:Y.Doc):string{
  return JSON.stringify(TiptapTransformer.fromYdoc(doc,"default"));
}
