export type TiptapMark = { type: string; attrs?: Record<string, unknown> };
export type TiptapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
};

const EMPTY_DOCUMENT: TiptapNode = { type: "doc", content: [{ type: "paragraph" }] };

export function parseDocumentContent(value: string): TiptapNode {
  if (!value.trim()) return EMPTY_DOCUMENT;
  try {
    const parsed = JSON.parse(value) as TiptapNode;
    if (parsed?.type === "doc") return parsed;
  } catch {
    // Legacy documents were stored as plain text.
  }
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] };
}

function walk(node: TiptapNode, visitor: (node: TiptapNode) => void) {
  visitor(node);
  node.content?.forEach((child) => walk(child, visitor));
}

export function documentPlainText(value: string) {
  const blocks: string[] = [];
  const collect = (node: TiptapNode): string => {
    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";
    const text = (node.content || []).map(collect).join("");
    return ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(node.type || "") ? `${text}\n` : text;
  };
  blocks.push(collect(parseDocumentContent(value)));
  return blocks.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function deriveDocumentPreview(value: string) {
  const plainText = documentPlainText(value);
  let previewImageUrl: string | null = null;
  walk(parseDocumentContent(value), (node) => {
    if (!previewImageUrl && node.type === "image" && typeof node.attrs?.src === "string") previewImageUrl = node.attrs.src;
  });
  return {
    previewText: plainText.replace(/\s+/g, " ").trim().slice(0, 360),
    wordCount: plainText ? plainText.split(/\s+/).filter(Boolean).length : 0,
    previewImageUrl,
  };
}

export function slugifyDocumentTitle(title: string) {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "untitled-document";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeUrl(value: unknown, image = false) {
  if (typeof value !== "string") return "";
  if (image && value.startsWith("/api/images/")) return value;
  if (/^(https?:|mailto:)/i.test(value) || value.startsWith("/") || value.startsWith("#")) return value;
  return "";
}

function renderMarks(text: string, marks: TiptapMark[] = []) {
  return marks.reduce((result, mark) => {
    if (mark.type === "bold") return `<strong>${result}</strong>`;
    if (mark.type === "italic") return `<em>${result}</em>`;
    if (mark.type === "underline") return `<u>${result}</u>`;
    if (mark.type === "strike") return `<s>${result}</s>`;
    if (mark.type === "code") return `<code>${result}</code>`;
    if (mark.type === "highlight") return `<mark>${result}</mark>`;
    if (mark.type === "link") {
      const href = safeUrl(mark.attrs?.href);
      return href ? `<a href="${escapeHtml(href)}" rel="noreferrer noopener">${result}</a>` : result;
    }
    return result;
  }, escapeHtml(text));
}

function renderNode(node: TiptapNode): string {
  if (node.type === "text") return renderMarks(node.text || "", node.marks);
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  if (node.type === "image") {
    const src = safeUrl(node.attrs?.src, true);
    if (!src) return "";
    const alt = escapeHtml(typeof node.attrs?.alt === "string" ? node.attrs.alt : "");
    const caption = typeof node.attrs?.caption === "string" ? node.attrs.caption.trim() : "";
    const width = typeof node.attrs?.width === "number" ? Math.min(100, Math.max(20, node.attrs.width)) : 100;
    const align = ["left", "center", "right"].includes(String(node.attrs?.align)) ? String(node.attrs?.align) : "center";
    return `<figure class="document-image document-image--${align}" style="width:${width}%"><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
  }
  const children = (node.content || []).map(renderNode).join("");
  switch (node.type) {
    case "doc": return children;
    case "paragraph": return `<p>${children || "<br>"}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return `<h${level}>${children}</h${level}>`;
    }
    case "bulletList": return `<ul>${children}</ul>`;
    case "orderedList": return `<ol>${children}</ol>`;
    case "listItem": return `<li>${children}</li>`;
    case "blockquote": return `<blockquote>${children}</blockquote>`;
    case "codeBlock": return `<pre><code>${children}</code></pre>`;
    default: return children;
  }
}

export function documentToHtml(value: string) {
  return renderNode(parseDocumentContent(value));
}

function markdownMarks(text: string, marks: TiptapMark[] = []) {
  return marks.reduce((result, mark) => {
    if (mark.type === "bold") return `**${result}**`;
    if (mark.type === "italic") return `_${result}_`;
    if (mark.type === "strike") return `~~${result}~~`;
    if (mark.type === "code") return `\`${result}\``;
    if (mark.type === "link") return safeUrl(mark.attrs?.href) ? `[${result}](${safeUrl(mark.attrs?.href)})` : result;
    return result;
  }, text.replace(/([\\`*_{}\[\]])/g, "\\$1"));
}

function markdownNode(node: TiptapNode, depth = 0): string {
  if (node.type === "text") return markdownMarks(node.text || "", node.marks);
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "horizontalRule") return "\n---\n";
  if (node.type === "image") {
    const src = safeUrl(node.attrs?.src, true);
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "Image";
    return src ? `![${alt.replace(/]/g, "\\]")}](${src})${node.attrs?.caption ? `\n_${String(node.attrs.caption)}_` : ""}` : "";
  }
  const children = (node.content || []).map((child) => markdownNode(child, depth + 1)).join("");
  if (node.type === "doc") return children.trim();
  if (node.type === "paragraph") return `${children}\n\n`;
  if (node.type === "heading") return `${"#".repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 2)))} ${children}\n\n`;
  if (node.type === "blockquote") return `${children.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (node.type === "codeBlock") return `\`\`\`\n${children}\n\`\`\`\n\n`;
  if (node.type === "bulletList" || node.type === "orderedList") return `${children}\n`;
  if (node.type === "listItem") return `${"  ".repeat(Math.max(0, depth - 2))}- ${children.trim()}\n`;
  return children;
}

export function documentToMarkdown(value: string) {
  return `${markdownNode(parseDocumentContent(value)).replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export const documentReadingMinutes = (wordCount: number) => Math.max(1, Math.ceil(wordCount / 220));

