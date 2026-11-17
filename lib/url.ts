/**
 * URL allowlisting. CMS-authored links are untrusted input: anything that is not
 * provably a safe relative path or an http/https/mailto/tel URL is dropped.
 */

const LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const IMAGE_SCHEMES = new Set(["http:", "https:"]);

/** Strips control characters and whitespace that are used to smuggle "java\nscript:" past naive checks. */
function normalise(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const cleaned = input.replace(/[\u0000-\u0020\u007F-\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/** A site-relative path: exactly one leading "/", never "//" or "/\" (protocol-relative). */
function isRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

function allow(input: unknown, schemes: ReadonlySet<string>): string | undefined {
  const value = normalise(input);
  if (value === undefined) return undefined;
  if (isRelativePath(value)) return value;
  // Anything that is not relative must parse as an absolute URL with an allowed scheme.
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (!schemes.has(parsed.protocol.toLowerCase())) return undefined;
  return parsed.toString();
}

/** Allowlisted href for anchors: relative path, or http/https/mailto/tel. Otherwise undefined. */
export function safeHref(input: unknown): string | undefined {
  return allow(input, LINK_SCHEMES);
}

/** Allowlisted image source: relative path, or http/https only. Otherwise undefined. */
export function safeImageSrc(input: unknown): string | undefined {
  return allow(input, IMAGE_SCHEMES);
}
