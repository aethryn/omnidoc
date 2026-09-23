const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function isAllowedMutationOrigin(method: string, requestUrl: string, origin: string | null, configuredOrigins: Array<string | undefined> = []) {
  if (safeMethods.has(method.toUpperCase()) || !origin) return true;
  const allowed = new Set<string>([new URL(requestUrl).origin]);
  configuredOrigins.forEach((value) => {
    if (!value) return;
    try { allowed.add(new URL(value).origin); } catch { /* Ignore invalid optional configuration. */ }
  });
  try { return allowed.has(new URL(origin).origin); } catch { return false; }
}
