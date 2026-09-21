"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { normalizeAvatarSource } from "@/lib/avatar";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function UserAvatar({ name, src, className = "", imageClassName = "h-full w-full object-cover", style }: { name: string; src?: string | null; className?: string; imageClassName?: string; style?: CSSProperties }) {
  const source = normalizeAvatarSource(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [source]);

  return (
    <span className={className} title={name} style={style}>
      {source && !failed
        ? <img src={source} alt="" referrerPolicy="no-referrer" className={imageClassName} onError={() => setFailed(true)} />
        : initials(name)}
    </span>
  );
}
