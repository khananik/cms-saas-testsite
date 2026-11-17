import Link from "next/link";

import { pickLink, pickList, pickString } from "@/lib/fields";
import type { BlockData, ChromeItem } from "@/lib/types";

import SiteNav, { type NavItem } from "./SiteNav";
import styles from "./SiteHeader.module.css";

/**
 * Sticky site header: wordmark plus the CMS-driven navigation.
 *
 * This stays a SERVER component. It does the CMS reading — which pulls in the
 * field helpers and, through them, the HTML sanitiser — and hands SiteNav a
 * small plain tree. Doing it the other way round would ship the whole chrome
 * payload and the sanitiser to the browser for no benefit.
 */

export type SiteHeaderProps = {
  /** SiteChrome.navigation — the Navigation singleton, or null when unavailable. */
  navigation: ChromeItem | null;
  /** SiteChrome.settings — carries the two halves of the wordmark. */
  settings: ChromeItem | null;
};

/* -------------------------------------------------------------------------- */
/* Navigation tree                                                            */
/* -------------------------------------------------------------------------- */

/** Rendered nesting: bar > group > link. Anything deeper is flattened, not dropped. */
const MAX_DEPTH = 3;
/**
 * Independent of MAX_DEPTH, which stops increasing once items are being
 * flattened. This one always increases, so malformed or self-referential data
 * cannot recurse forever.
 */
const MAX_WALK_DEPTH = 10;
/** Hard ceiling on rendered items, so a runaway tree cannot wedge the render. */
const MAX_ITEMS = 300;

const LABEL_FIELDS = ["label", "title", "text", "name", "displayName"] as const;
const HREF_FIELDS = ["href", "link", "url"] as const;
const CHILD_FIELDS = ["children", "items", "navItems", "subItems", "links"] as const;

type WalkState = { count: number };

/**
 * Case-insensitive boolean read, matching the tolerance of the lib/fields.ts
 * helpers: Graph property casing varies per instance, so the flag is never read
 * by indexing `data` with one assumed spelling. Only an explicit true (or the
 * strings "true"/"1") counts — anything else is false.
 */
function pickBoolean(data: BlockData | null | undefined, ...names: string[]): boolean {
  if (typeof data !== "object" || data === null) return false;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const key of Object.keys(data)) {
    if (!wanted.has(key.toLowerCase())) continue;
    const value = data[key];
    if (value === true) return true;
    if (typeof value === "string" && (value.toLowerCase() === "true" || value === "1")) return true;
  }
  return false;
}

/**
 * Converts the CMS NavigationItem tree into the plain tree SiteNav renders.
 *
 * `pickLink` runs every href through the lib/url.ts allowlist, so an item can
 * only ever carry a relative path or an http/https/mailto/tel URL; anything
 * else arrives as `href: undefined` and SiteNav renders a span. The authored
 * shape here is a ContentReference, from which pickLink reads `url.default`
 * (e.g. "/en/personal-banking/").
 */
function walk(nodes: BlockData[], depth: number, walkDepth: number, state: WalkState, idPrefix: string): NavItem[] {
  if (walkDepth > MAX_WALK_DEPTH) return [];

  const out: NavItem[] = [];

  for (const [index, node] of nodes.entries()) {
    if (state.count >= MAX_ITEMS) break;

    const label = pickString(node, ...LABEL_FIELDS);
    const children = pickList(node, ...CHILD_FIELDS);

    if (label === undefined) {
      // An unlabelled wrapper is not renderable, but its children are: lift them
      // into this level rather than losing a whole branch.
      // "f" keeps lifted ids from colliding with a labelled sibling's children.
      out.push(...walk(children, depth, walkDepth + 1, state, `${idPrefix}-${index}f`));
      continue;
    }

    state.count += 1;
    const id = `${idPrefix}-${index}`;
    const link = pickLink(node, ...HREF_FIELDS);

    const item: NavItem = {
      id,
      label,
      children: depth < MAX_DEPTH ? walk(children, depth + 1, walkDepth + 1, state, id) : [],
    };
    if (link !== undefined) item.href = link.href;
    if (pickBoolean(node, "openInNewTab", "newTab", "openInNewWindow")) item.openInNewTab = true;

    out.push(item);

    // At the deepest rendered level, descendants become siblings in the same
    // panel instead of disappearing.
    if (depth >= MAX_DEPTH && children.length > 0) {
      out.push(...walk(children, depth, walkDepth + 1, state, id));
    }
  }

  return out;
}

/** Exported for reuse by the footer, which renders the same tree flat. */
export function buildNavTree(navigation: ChromeItem | null): NavItem[] {
  if (!navigation) return [];
  const roots = pickList(navigation, ...CHILD_FIELDS);
  return walk(roots, 1, 1, { count: 0 }, "nav");
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

export default function SiteHeader({ navigation, settings }: SiteHeaderProps) {
  const primary = pickString(settings, "logoTextPrimary", "logoPrimary", "logoText", "siteName");
  const secondary = pickString(settings, "logoTextSecondary", "logoSecondary", "siteNameSuffix");
  const items = buildNavTree(navigation);

  // Nothing authored at all — render no chrome rather than an empty bar.
  if (primary === undefined && secondary === undefined && items.length === 0) return null;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.wordmark} href="/">
          {primary ? <span className={styles.wordmarkPrimary}>{primary}</span> : null}
          {secondary ? <span className={styles.wordmarkSecondary}>{secondary}</span> : null}
          {primary === undefined && secondary === undefined ? (
            <span className={styles.wordmarkPrimary}>Home</span>
          ) : null}
        </Link>

        <SiteNav items={items} />
      </div>
    </header>
  );
}
