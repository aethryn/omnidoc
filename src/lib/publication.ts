import { createHash } from "crypto";

import { slugifyDocumentTitle } from "@/lib/document-content";

export function documentRevisionHash(title: string, content: string) {
  return createHash("sha256").update(title).update("\0").update(content).digest("hex");
}

export function publicationUrl(origin: string, publicationId: string, title: string) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  let base = origin;
  if (configured) {
    try { base = new URL(configured).origin; } catch { /* Request origin is a safe fallback. */ }
  }
  return `${base}/p/${publicationId}/${slugifyDocumentTitle(title)}`;
}

