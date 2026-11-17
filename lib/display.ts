import type { CompositionNode, DisplaySetting } from "./types";

/**
 * Visual Builder display settings.
 *
 * Editors configure each section, row, column and component in the CMS with settings
 * like `background: opal`, `headingSize: xl` or `width: contained`. They arrive on the
 * composition node, NOT on the block content, so a block component cannot read them
 * from `data`.
 *
 * Rather than have every block map every setting itself — 14 components all drifting
 * apart — the renderer emits each setting as a `data-ob-<key>` attribute on the node's
 * wrapper element, and one stylesheet (app/display.css) maps those attributes to
 * styles. A setting therefore applies consistently wherever it is used, and adding a
 * new value is a CSS change in one file rather than a change to every component.
 *
 * Both key and value are untrusted CMS strings, so both are normalised to a strict
 * character set before they are allowed anywhere near an attribute name.
 */

/** Attribute names/values are restricted to this shape; anything else is dropped. */
const SAFE_TOKEN = /^[a-z0-9]([a-z0-9-]{0,48})$/;

/** Settings that carry no visual meaning, or that duplicate another key. */
const IGNORED_KEYS = new Set(["key", "id"]);

/** CMS booleans arrive as "True"/"False"/"true"/"false" — normalise to "true"/"false". */
function normaliseValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower === "true" || lower === "false") return lower;

  // "fullWidth" -> "fullwidth", "r16x9" -> "r16x9". Casing is not reliable across
  // instances, so everything is lowercased and non-token characters become hyphens.
  const token = lower.replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return SAFE_TOKEN.test(token) ? token : undefined;
}

function normaliseKey(key: unknown): string | undefined {
  if (typeof key !== "string") return undefined;
  const token = key.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  if (!SAFE_TOKEN.test(token) || IGNORED_KEYS.has(token)) return undefined;
  return token;
}

export type DisplayAttributes = Record<string, string>;

/**
 * Turns a node's display settings into `data-ob-*` attributes to spread onto its
 * wrapper element:
 *
 *   <div {...displayAttributes(node)}>…</div>
 *   -> <div data-ob-background="opal" data-ob-headingsize="xl">
 *
 * Returns {} for a node with no usable settings, so the spread is always safe.
 * Never throws: display settings are CMS data and may be missing or malformed.
 */
export function displayAttributes(node: CompositionNode | null | undefined): DisplayAttributes {
  const settings: unknown = node?.displaySettings;
  if (!Array.isArray(settings)) return {};

  const attributes: DisplayAttributes = {};
  for (const entry of settings as DisplaySetting[]) {
    if (!entry || typeof entry !== "object") continue;
    const key = normaliseKey(entry.key);
    if (key === undefined) continue;
    const value = normaliseValue(entry.value);
    if (value === undefined) continue;
    // First occurrence wins, matching how the rest of the codebase reads settings.
    attributes[`data-ob-${key}`] ??= value;
  }
  return attributes;
}

/**
 * Reads one setting's normalised value, for the rare case where a component needs to
 * branch in TypeScript rather than in CSS (for example choosing a heading level or
 * swapping an element). Prefer the CSS attribute selectors where you can.
 */
export function displaySetting(
  node: CompositionNode | null | undefined,
  ...keys: string[]
): string | undefined {
  const attributes = displayAttributes(node);
  for (const key of keys) {
    const normalised = normaliseKey(key);
    if (normalised === undefined) continue;
    const value = attributes[`data-ob-${normalised}`];
    if (value !== undefined) return value;
  }
  return undefined;
}
