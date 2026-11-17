import type { BlockData } from "./types";
import { sanitizeHtml } from "./sanitize";
import { safeHref, safeImageSrc } from "./url";

/**
 * Tolerant field accessors. Optimizely Graph property casing differs per instance
 * and per content type, so block components never index `data` directly: they ask
 * for several candidate names and take whatever the instance actually returned.
 * None of these throw; all tolerate null/undefined input.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Case-insensitive property read across the candidate names, in priority order. */
function raw(data: BlockData | null | undefined, names: readonly string[]): unknown {
  if (!isRecord(data)) return undefined;
  const lookup = new Map<string, unknown>();
  for (const key of Object.keys(data)) {
    const lower = key.toLowerCase();
    if (!lookup.has(lower)) lookup.set(lower, data[key]);
  }
  for (const name of names) {
    if (typeof name !== "string") continue;
    const value = lookup.get(name.toLowerCase());
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const key of ["text", "value", "default", "title", "name", "displayName", "html"]) {
      const nested = value[key];
      if (typeof nested === "string" || typeof nested === "number") {
        const found = firstString(nested);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

/** Plain text field. Returns undefined when empty or absent. */
export function pickString(data: BlockData | null | undefined, ...names: string[]): string | undefined {
  return firstString(raw(data, names));
}

/** Numeric field. Accepts numbers and numeric strings ("1,200" / "42%"). */
export function pickNumber(data: BlockData | null | undefined, ...names: string[]): number | undefined {
  const value = raw(data, names);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = firstString(value);
  if (text === undefined) return undefined;
  const parsed = Number(text.replace(/[^0-9eE+.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Rich text / HTML field. ALWAYS returns sanitised HTML — the only value that may
 * legitimately reach dangerouslySetInnerHTML. Handles { html: string } RichText shapes.
 */
export function pickHtml(data: BlockData | null | undefined, ...names: string[]): string | undefined {
  const value = raw(data, names);
  let dirty: unknown = value;
  if (isRecord(value)) {
    dirty = value.html ?? value.value ?? value.text ?? value.default;
  }
  if (typeof dirty !== "string") return undefined;
  const clean = sanitizeHtml(dirty);
  return clean.trim().length > 0 ? clean : undefined;
}

/** Image field. `src` is allowlisted; an unsafe or missing URL yields undefined. */
export function pickImage(
  data: BlockData | null | undefined,
  ...names: string[]
): { src: string; alt?: string } | undefined {
  const value = raw(data, names);
  const node = Array.isArray(value) ? value.find(isRecord) : value;

  let rawSrc: unknown = node;
  let alt: string | undefined;

  if (isRecord(node)) {
    const url = node.url;
    rawSrc =
      (isRecord(url) ? url.default ?? url.hierarchical : url) ??
      node.src ??
      node.default ??
      node.path ??
      node.href;
    alt = firstString(node.alt ?? node.altText ?? node.alternateText ?? node.title ?? node.caption);
  }

  const src = safeImageSrc(rawSrc);
  if (src === undefined) return undefined;
  return alt === undefined ? { src } : { src, alt };
}

/** Link field. `href` is allowlisted; callers must omit the <a> when this is undefined. */
export function pickLink(
  data: BlockData | null | undefined,
  ...names: string[]
): { href: string; label?: string } | undefined {
  const value = raw(data, names);
  const node = Array.isArray(value) ? value.find((item) => isRecord(item) || typeof item === "string") : value;

  let rawHref: unknown = node;
  let label: string | undefined;

  if (isRecord(node)) {
    const url = node.url;
    rawHref =
      (isRecord(url) ? url.default ?? url.hierarchical : url) ??
      node.href ??
      node.link ??
      node.default ??
      node.target;
    label = firstString(node.text ?? node.title ?? node.label ?? node.displayName ?? node.name);
  }

  const href = safeHref(rawHref);
  if (href === undefined) return undefined;
  return label === undefined ? { href } : { href, label };
}

/** Repeating field. Always an array — never null — of record-shaped items. */
export function pickList(data: BlockData | null | undefined, ...names: string[]): BlockData[] {
  const value = raw(data, names);
  if (Array.isArray(value)) {
    return value.filter(isRecord) as BlockData[];
  }
  if (isRecord(value)) {
    for (const key of ["items", "nodes", "values", "children"]) {
      const nested = value[key];
      if (Array.isArray(nested)) return nested.filter(isRecord) as BlockData[];
    }
    return [value as BlockData];
  }
  return [];
}
