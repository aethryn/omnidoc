import { lookup } from "dns/promises";
import { createHash } from "crypto";
import net from "net";

export const LINK_PREVIEW_ERROR = "LINK_PREVIEW_UNAVAILABLE";
const maxHtmlBytes = 1_000_000;
const maxMediaBytes = 2_000_000;

export type LinkPreviewData = { url: string; title: string | null; description: string | null; siteName: string | null; faviconUrl: string | null; imageUrl: string | null; isAvailable: boolean };

export function normalizePreviewUrl(value: string, base?: string) {
  const candidate = value.trim();
  const url = new URL(candidate.match(/^[a-z][a-z\d+.-]*:/i) ? candidate : base ? candidate : `https://${candidate}`, base);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error(LINK_PREVIEW_ERROR);
  url.hash = "";
  return url;
}

export function previewUrlHash(url: string) { return createHash("sha256").update(url).digest("hex"); }

function blockedIp(address: string) {
  if (net.isIPv4(address)) {
    const octets = address.split(".").map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || octets[0] >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:192.168.");
}

async function assertPublicHost(url: URL) {
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname === "metadata.google.internal") throw new Error(LINK_PREVIEW_ERROR);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => blockedIp(address))) throw new Error(LINK_PREVIEW_ERROR);
}

export async function fetchPublic(url: URL, media = false) {
  let current = url;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicHost(current);
    let response: Response;
    response = await fetch(current, { redirect: "manual", signal:AbortSignal.timeout(4_000), headers: { Accept: media ? "image/*" : "text/html,application/xhtml+xml" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error(LINK_PREVIEW_ERROR);
      current = normalizePreviewUrl(location, current.href);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error(LINK_PREVIEW_ERROR);
}

function decodeEntities(value: string) { return value.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function metadata(html: string, name: string) { const match = html.match(new RegExp(`<meta\\s+(?:[^>]*?\\s)?(?:property|name)=["']${name}["'][^>]*?content=["']([^"']*)["'][^>]*>`, "i")) || html.match(new RegExp(`<meta\\s+(?:[^>]*?\\s)?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${name}["'][^>]*>`, "i")); return match?.[1] ? decodeEntities(match[1].trim()).slice(0, 2_000) : null; }

async function readLimited(response: Response, limit: number) {
  if (!response.body) { const buffer = new Uint8Array(await response.arrayBuffer()); if (buffer.byteLength > limit) throw new Error(LINK_PREVIEW_ERROR); return buffer; }
  const reader = response.body.getReader(); const chunks:Uint8Array[]=[]; let total=0;
  while (true) { const part=await reader.read(); if (part.done) break; total+=part.value.byteLength; if (total>limit) { await reader.cancel(); throw new Error(LINK_PREVIEW_ERROR); } chunks.push(part.value); }
  const result=new Uint8Array(total); let offset=0; for (const chunk of chunks) { result.set(chunk,offset); offset+=chunk.byteLength; } return result;
}

export async function readLinkPreview(url: URL): Promise<LinkPreviewData> {
  const { response, finalUrl } = await fetchPublic(url);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) throw new Error(LINK_PREVIEW_ERROR);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxHtmlBytes) throw new Error(LINK_PREVIEW_ERROR);
  const buffer = await readLimited(response, maxHtmlBytes);
  const html = new TextDecoder().decode(buffer);
  const title = metadata(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim().slice(0, 300) || null;
  const image = metadata(html, "og:image");
  return { url: finalUrl.href, title, description: metadata(html, "og:description") || metadata(html, "description"), siteName: metadata(html, "og:site_name") || finalUrl.hostname, faviconUrl: new URL("/favicon.ico", finalUrl).href, imageUrl: image ? normalizePreviewUrl(image, finalUrl.href).href : null, isAvailable: true };
}

export async function readPreviewMedia(url: URL) {
  const { response } = await fetchPublic(url, true);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(LINK_PREVIEW_ERROR);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxMediaBytes) throw new Error(LINK_PREVIEW_ERROR);
  const buffer = await readLimited(response, maxMediaBytes);
  return { buffer, contentType };
}
