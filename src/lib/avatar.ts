export function normalizeAvatarSource(value: unknown) {
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (!source) return null;
  if (/^[a-zA-Z0-9._-]+$/.test(source)) return `/${source}`;
  if (source.startsWith("/") && !source.startsWith("//")) return source;
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function avatarFromAuthMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const item = metadata as Record<string, unknown>;
  return normalizeAvatarSource(item.avatar_url) || normalizeAvatarSource(item.picture);
}

export function nameFromAuthMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const item = metadata as Record<string, unknown>;
  for (const value of [item.full_name, item.name]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  }
  return null;
}
