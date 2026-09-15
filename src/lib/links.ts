export function normalizeHttpUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
