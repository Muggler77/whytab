const explicitScheme = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeHttpUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = explicitScheme.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function safeHttpHref(value: string) {
  return normalizeHttpUrl(value) || "about:blank";
}
