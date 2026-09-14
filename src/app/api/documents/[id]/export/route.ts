import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { AlignmentType, Document as WordDocument, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, TextRun } from "docx";

import { createAuthErrorResponse, getCurrentUserIdFromRequest } from "@/lib/auth";
import { documentPlainText, documentToHtml, documentToMarkdown, parseDocumentContent, type TiptapNode } from "@/lib/document-content";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const formats = new Set(["md", "pdf", "docx", "html"]);

function fileName(title: string, format: string) {
  const safe = title.normalize("NFKD").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 90) || "document";
  return `${safe}.${format}`;
}

function collectText(node: TiptapNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return (node.content || []).map(collectText).join("");
}

function flattenBlocks(node: TiptapNode, result: TiptapNode[] = []) {
  if (["paragraph", "heading", "blockquote", "codeBlock", "image", "horizontalRule"].includes(node.type || "")) result.push(node);
  else node.content?.forEach((child) => flattenBlocks(child, result));
  return result;
}

async function imageAssets(images: Array<{ fileUrl: string; fileName: string; mimeType: string }>) {
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const assets = new Map<string, { raw: Buffer; png: Buffer; mimeType: string }>();
  await Promise.all(images.map(async (image) => {
    const { data } = await supabase.storage.from("document-images").download(image.fileName);
    if (!data) return;
    const raw = Buffer.from(await data.arrayBuffer());
    try { assets.set(image.fileUrl, { raw, png: await sharp(raw, { animated: false }).png().toBuffer(), mimeType: image.mimeType }); }
    catch { /* Missing or corrupt images become labeled placeholders. */ }
  }));
  return assets;
}

async function portableHtml(title: string, content: string, assets: Map<string, { raw: Buffer; mimeType: string }>) {
  let body = documentToHtml(content);
  for (const [url, asset] of assets) body = body.replaceAll(`src="${url}"`, `src="data:${asset.mimeType};base64,${asset.raw.toString("base64")}"`);
  const safeTitle = title.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]!));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title><style>body{margin:0;background:#f5f3ee;color:#29251f;font-family:Helvetica,Arial,sans-serif}.page{box-sizing:border-box;width:min(820px,calc(100% - 32px));margin:40px auto;padding:72px;background:#fffefa;border:1px solid #e3ded4}header{padding-bottom:28px;border-bottom:1px solid #e3ded4}header small{color:#77659a;letter-spacing:.12em;text-transform:uppercase}h1{font:400 56px/1 Georgia,serif;letter-spacing:-.035em}main{padding-top:34px;font-size:18px;line-height:1.7}main h1,main h2,main h3{font-family:Georgia,serif;font-weight:400;line-height:1.1;margin-top:1.7em}blockquote{border-left:2px solid #77659a;margin:1.5em 0;padding-left:18px;color:#625b68}pre{white-space:pre-wrap;background:#f1eee8;padding:16px;border-radius:8px}img{max-width:100%;height:auto;border-radius:8px}figure{margin:2em auto}figcaption{text-align:center;color:#898177;font-size:12px}a{color:#55437c}@media(max-width:600px){.page{margin:0;width:100%;padding:36px 24px;border:0}h1{font-size:42px}}</style></head><body><article class="page"><header><small>Omnidoc export</small><h1>${safeTitle}</h1></header><main>${body}</main></article></body></html>`;
}

async function makePdf(title: string, content: string, assets: Map<string, { png: Buffer }>) {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margins: { top: 62, left: 66, right: 66, bottom: 62 }, bufferPages: true, info: { Title: title, Creator: "Omnidoc" } });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.fillColor("#77659a").font("Helvetica").fontSize(9).text("OMNIDOC · DOCUMENT", { characterSpacing: 1.2 });
    pdf.moveDown(1.4).fillColor("#29251f").font("Times-Roman").fontSize(38).text(title, { lineGap: 3 });
    pdf.moveDown(1.1).strokeColor("#ded9ce").lineWidth(.7).moveTo(66, pdf.y).lineTo(529, pdf.y).stroke().moveDown(2);
    for (const block of flattenBlocks(parseDocumentContent(content))) {
      if (block.type === "image") {
        const asset = assets.get(String(block.attrs?.src || ""));
        if (asset) {
          if (pdf.y > 620) pdf.addPage();
          try { pdf.image(asset.png, { fit: [463, 320], align: "center" }); pdf.moveDown(.7); }
          catch { pdf.fillColor("#8a8379").font("Helvetica-Oblique").fontSize(10).text("Image unavailable in export").moveDown(); }
          if (block.attrs?.caption) pdf.fillColor("#8a8379").font("Helvetica").fontSize(9).text(String(block.attrs.caption), { align: "center" }).moveDown();
        } else pdf.fillColor("#8a8379").font("Helvetica-Oblique").fontSize(10).text("Image unavailable in export").moveDown();
        continue;
      }
      const text = collectText(block).trim();
      if (!text && block.type !== "horizontalRule") continue;
      if (block.type === "heading") {
        const level = Number(block.attrs?.level) || 2;
        pdf.moveDown(level === 1 ? 1.2 : .8).fillColor("#29251f").font("Times-Roman").fontSize(level === 1 ? 28 : level === 2 ? 22 : 17).text(text, { lineGap: 2 }).moveDown(.35);
      } else if (block.type === "blockquote") {
        pdf.fillColor("#625b68").font("Times-Italic").fontSize(15).text(text, { indent: 18, lineGap: 4 }).moveDown(.8);
      } else if (block.type === "codeBlock") {
        pdf.fillColor("#38332d").font("Courier").fontSize(9.5).text(text, { lineGap: 3 }).moveDown(.8);
      } else if (block.type === "horizontalRule") {
        pdf.moveDown().strokeColor("#ded9ce").moveTo(66, pdf.y).lineTo(529, pdf.y).stroke().moveDown();
      } else {
        pdf.fillColor("#29251f").font("Helvetica").fontSize(11.5).text(text, { lineGap: 5 }).moveDown(.75);
      }
    }
    const pages = pdf.bufferedPageRange();
    for (let index = 0; index < pages.count; index++) {
      pdf.switchToPage(index);
      pdf.fillColor("#9a9389").font("Helvetica").fontSize(8).text(`${index + 1} / ${pages.count}`, 66, 790, { width: 463, align: "right" });
    }
    pdf.end();
  });
}

async function makeDocx(title: string, content: string, assets: Map<string, { png: Buffer }>) {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: "OMNIDOC · DOCUMENT", color: "77659A", size: 18, characterSpacing: 30 })], spacing: { after: 280 } }),
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 460 } }),
  ];
  for (const block of flattenBlocks(parseDocumentContent(content))) {
    if (block.type === "image") {
      const asset = assets.get(String(block.attrs?.src || ""));
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: asset ? [new ImageRun({ data: asset.png, transformation: { width: 560, height: 340 }, type: "png" })] : [new TextRun({ text: "Image unavailable in export", italics: true, color: "898177" })], spacing: { before: 220, after: 120 } }));
      if (block.attrs?.caption) children.push(new Paragraph({ text: String(block.attrs.caption), alignment: AlignmentType.CENTER, style: "Caption" }));
      continue;
    }
    const text = collectText(block).trim();
    if (!text) continue;
    const level = Number(block.attrs?.level) || 2;
    children.push(new Paragraph({
      text,
      ...(block.type === "heading" ? { heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 } : {}),
      ...(block.type === "blockquote" ? { indent: { left: 420 }, border: { left: { color: "77659A", size: 8, space: 14, style: "single" as const } } } : {}),
      spacing: { after: block.type === "heading" ? 150 : 220, line: 330 },
    }));
  }
  const document = new WordDocument({ sections: [{ properties: { page: { margin: { top: 900, right: 1000, bottom: 900, left: 1000 } } }, children, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Omnidoc · ", PageNumber.CURRENT], color: "8A8379", size: 16 })] })] }) } }] });
  return Buffer.from(await Packer.toBuffer(document));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const format = request.nextUrl.searchParams.get("format") || "";
  if (!formats.has(format)) return NextResponse.json({ error: "Choose md, pdf, docx, or html" }, { status: 400 });
  const auth = await getCurrentUserIdFromRequest(request);
  if (!auth.userId) return createAuthErrorResponse(auth);
  const { id } = await params;
  const document = await prisma.document.findFirst({
    where: { id, OR: [{ userId: auth.userId }, { collaborators: { some: { userId: auth.userId, acceptedAt: { not: null } } } }] },
    select: { title: true, content: true, images: { select: { fileUrl: true, fileName: true, mimeType: true } } },
  });
  if (!document) return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  const assets = await imageAssets(document.images);
  let body: Buffer;
  let contentType: string;
  if (format === "md") { body = Buffer.from(documentToMarkdown(document.content)); contentType = "text/markdown; charset=utf-8"; }
  else if (format === "html") { body = Buffer.from(await portableHtml(document.title, document.content, assets)); contentType = "text/html; charset=utf-8"; }
  else if (format === "pdf") { body = await makePdf(document.title, document.content, assets); contentType = "application/pdf"; }
  else { body = await makeDocx(document.title, document.content, assets); contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; }
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${fileName(document.title, format)}"`, "Cache-Control": "private, no-store" } });
}

