import { lexer, type Token } from "marked";
import type { TiptapMark, TiptapNode } from "./document-content";

const emptyDoc = (): TiptapNode => ({ type: "doc", content: [{ type: "paragraph" }] });

function safeLink(value: unknown) {
  if (typeof value !== "string") return "";
  return /^(https?:|mailto:)/i.test(value) ? value : "";
}

function inline(tokens: Token[] = []): TiptapNode[] {
  const output: TiptapNode[] = [];
  const append = (text: string, marks: TiptapMark[] = []) => {
    if (text) output.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
  };
  for (const token of tokens as Array<Token & { tokens?: Token[]; text?: string; raw?: string; href?: string; title?: string }>) {
    if (token.type === "text" || token.type === "escape") append(token.text || token.raw || "");
    else if (token.type === "strong") inline(token.tokens).forEach((node) => output.push(node.type === "text" ? { ...node, marks: [...(node.marks || []), { type: "bold" }] } : node));
    else if (token.type === "em") inline(token.tokens).forEach((node) => output.push(node.type === "text" ? { ...node, marks: [...(node.marks || []), { type: "italic" }] } : node));
    else if (token.type === "del") inline(token.tokens).forEach((node) => output.push(node.type === "text" ? { ...node, marks: [...(node.marks || []), { type: "strike" }] } : node));
    else if (token.type === "codespan") append(token.text || "", [{ type: "code" }]);
    else if (token.type === "link") {
      const href = safeLink(token.href);
      inline(token.tokens).forEach((node) => output.push(href && node.type === "text" ? { ...node, marks: [...(node.marks || []), { type: "link", attrs: { href } }] } : node));
    } else if (token.type === "br") output.push({ type: "hardBreak" });
    else if (token.type === "image") continue;
    else if (token.type !== "html") append(token.text || token.raw || "");
  }
  return output;
}

function blocks(tokens: Token[]): TiptapNode[] {
  const output: TiptapNode[] = [];
  for (const token of tokens as Array<Token & { tokens?: Token[]; text?: string; lang?: string; ordered?: boolean; items?: Array<{ tokens?: Token[]; text?: string }> }>) {
    if (token.type === "space" || token.type === "html") continue;
    if (token.type === "heading") output.push({ type: "heading", attrs: { level: Math.min(6, Math.max(1, Number((token as { depth?: number }).depth) || 1)) }, content: inline(token.tokens) });
    else if (token.type === "paragraph") output.push({ type: "paragraph", content: inline(token.tokens) });
    else if (token.type === "text") output.push({ type: "paragraph", content: inline(token.tokens || [{ type: "text", text: token.text || "" } as Token]) });
    else if (token.type === "blockquote") output.push({ type: "blockquote", content: blocks(token.tokens || []) });
    else if (token.type === "code") output.push({ type: "codeBlock", attrs: { language: token.lang || null }, content: token.text ? [{ type: "text", text: token.text }] : undefined });
    else if (token.type === "hr") output.push({ type: "horizontalRule" });
    else if (token.type === "list") output.push({ type: token.ordered ? "orderedList" : "bulletList", attrs: token.ordered ? { start: 1 } : undefined, content: (token.items || []).map((item) => ({ type: "listItem", content: blocks(item.tokens || [{ type: "paragraph", tokens: [{ type: "text", text: item.text || "" }] } as Token]) })) });
  }
  return output.length ? output : [{ type: "paragraph" }];
}

export function markdownToTiptap(markdown: string): TiptapNode {
  if (!markdown.trim()) return emptyDoc();
  return { type: "doc", content: blocks(lexer(markdown, { gfm: true })) };
}

export function markdownToPlainText(markdown: string) {
  const doc = markdownToTiptap(markdown);
  const read = (node: TiptapNode): string => {
    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";
    const content = (node.content || []).map(read).join("");
    return ["doc", "bulletList", "orderedList"].includes(node.type || "") ? content : `${content}\n`;
  };
  return read(doc).replace(/\n{2,}/g, "\n").trim();
}

export function looksLikeMarkdown(value: string) {
  const text = value.trim();
  if (!text) return false;
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|---+\s*$)/m.test(text) || /(?:\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/.test(text);
}
