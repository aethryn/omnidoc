"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

type Preview = { url: string; title: string | null; description: string | null; siteName: string | null; faviconUrl: string | null; imageUrl: string | null; isAvailable: boolean };
const cache = new Map<string, { preview:Preview; expiresAt:number }>();

export function LinkPreviewCard({ editor }: { editor: Editor }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const root = editor.view.dom;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let activeAnchor: HTMLAnchorElement | null = null;
    const show = (anchor: HTMLAnchorElement) => {
      let href: string;
      try { href = new URL(anchor.href).href; } catch { return; }
      if (!/^https?:$/i.test(new URL(href).protocol)) return;
      activeAnchor = anchor;
      if (timer) clearTimeout(timer);
      if (hideTimer) clearTimeout(hideTimer);
      const rect = anchor.getBoundingClientRect();
      setPosition({ left: Math.min(Math.max(12, rect.left), window.innerWidth - 352), top: Math.min(rect.bottom + 8, window.innerHeight - 190) });
      const cached = cache.get(href);
      if (cached && cached.expiresAt > Date.now()) { setPreview(cached.preview); return; }
      if (cached) cache.delete(href);
      setLoading(true); setPreview(null);
      timer = setTimeout(() => {
        fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<Preview> : Promise.reject(new Error("preview unavailable"))).then((data) => { cache.set(href, { preview:data, expiresAt:Date.now()+(data.isAvailable?86_400_000:900_000) }); if (activeAnchor === anchor) setPreview(data); }).catch(() => { const data={ url: href, title: null, description: null, siteName: new URL(href).hostname, faviconUrl:null, imageUrl: null, isAvailable: false }; cache.set(href,{preview:data,expiresAt:Date.now()+900_000}); if (activeAnchor === anchor) setPreview(data); }).finally(() => { if (activeAnchor === anchor) setLoading(false); });
      }, 300);
    };
    const hide = () => { hideTimer = setTimeout(() => { activeAnchor = null; setPreview(null); setPosition(null); setLoading(false); }, 220); hideTimerRef.current = hideTimer; };
    const enter = (event: Event) => { const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]"); if (anchor && root.contains(anchor)) show(anchor); };
    const leave = (event: MouseEvent) => { if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) hide(); };
    const focus = (event: FocusEvent) => { const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]"); if (anchor) show(anchor); };
    const touch = (event: TouchEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !root.contains(anchor)) return;
      event.preventDefault();
      show(anchor);
    };
    root.addEventListener("mouseover", enter); root.addEventListener("mouseout", leave); root.addEventListener("focusin", focus); root.addEventListener("touchend", touch, {passive:false});
    return () => { if (timer) clearTimeout(timer); if (hideTimer) clearTimeout(hideTimer); root.removeEventListener("mouseover", enter); root.removeEventListener("mouseout", leave); root.removeEventListener("focusin", focus); root.removeEventListener("touchend", touch); };
  }, [editor]);

  if (!position || (!loading && !preview)) return null;
  return <div className="link-preview-card" style={{ left: position.left, top: position.top }} onMouseEnter={() => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }} onMouseLeave={() => { hideTimerRef.current = setTimeout(() => { setPreview(null); setPosition(null); }, 220); }} role="dialog" aria-label="Link preview">
    <button type="button" className="link-preview-close" onClick={() => { setPreview(null); setPosition(null); setLoading(false); }} aria-label="Close link preview">×</button>
    {loading ? <div className="link-preview-loading">Loading preview…</div> : preview && <a href={preview.url} target="_blank" rel="noreferrer noopener" className="link-preview-content"><div className="link-preview-copy"><strong>{preview.faviconUrl&&<img className="link-preview-favicon" src={preview.faviconUrl} alt=""/>}{preview.title || preview.siteName || "Open link"}</strong>{preview.description && <span>{preview.description}</span>}<small>{preview.siteName || new URL(preview.url).hostname}</small></div>{preview.imageUrl && <img src={preview.imageUrl} alt="" />}</a>}
  </div>;
}
