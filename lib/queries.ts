import "server-only";

import { GraphError, graphQuery } from "@/lib/graph";
import type { ChromeItem, ExperiencePage, SiteChrome } from "@/lib/types";

/**
 * Query construction for testsiteanik.
 *
 * Rules that must not be relaxed:
 *  - The request path, locale, content key and version all come from the URL
 *    and are therefore UNTRUSTED. They are passed as GraphQL *variables*
 *    only — never interpolated into a query string.
 *  - Only the fragment text (a compile-time constant from lib/fragments.ts)
 *    is interpolated.
 *  - The preview token is handed straight to graphQuery, which puts it in an
 *    Authorization header. It never appears in a query, a variable or a URL.
 */

/* -------------------------------------------------------------------------- */
/* Composition selection                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Some Graph instances expose the composition node types as
 * `CompositionStructureNode` / `CompositionComponentNode`, others prefix them
 * with `I`. If the whole query fails with "Unknown type", flip these two
 * constants — that is the only change needed.
 */
export const STRUCTURE_NODE_TYPE = "CompositionStructureNode";
export const COMPONENT_NODE_TYPE = "CompositionComponentNode";

const NODE_FIELDS = `
  __typename
  key
  nodeType
  displayName
  displayTemplateKey
  displaySettings { key value }
`;

const COMPONENT_SELECTION = `
  ... on ${COMPONENT_NODE_TYPE} {
    component {
      _metadata {
        key
        version
        locale
        displayName
        types
        url { default hierarchical }
      }
      # _json returns every authored field of the block, including nested item
      # arrays such as FaqContainerBlock.faqItems and CustomerVoicesBlock.cards.
      # It replaces per-type inline fragments on purpose: a fragment naming one
      # field that does not exist fails the WHOLE query, and the field names vary
      # per instance. With _json, adding a block type to the CMS needs no query
      # change at all. normaliseComponent() below flattens it onto the block.
      _json
    }
  }
`;

/**
 * GraphQL cannot recurse, so the section > row > column > component tree is
 * spelled out level by level. `depth` is the number of levels still to emit.
 */
function compositionNodes(depth: number): string {
  const children =
    depth > 1
      ? `... on ${STRUCTURE_NODE_TYPE} { nodes { ${compositionNodes(depth - 1)} } }`
      : "";
  return `${NODE_FIELDS}\n${COMPONENT_SELECTION}\n${children}`;
}

/** composition (root) > section > row > column > component */
const COMPOSITION_SELECTION = `
  composition {
    ${NODE_FIELDS}
    nodes { ${compositionNodes(4)} }
  }
`;

const PAGE_METADATA_SELECTION = `
  _metadata {
    key
    version
    locale
    displayName
    types
    url { default hierarchical }
    published
  }
`;

const PAGE_SELECTION = `${PAGE_METADATA_SELECTION}\n${COMPOSITION_SELECTION}`;

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

/** Published Experience page looked up by `_metadata.url.default`. */
export const PAGE_BY_PATH_QUERY = `
  query PageByPath($path: String!) {
    _Experience(
      where: { _metadata: { url: { default: { eq: $path } } } }
      limit: 1
    ) {
      items { ${PAGE_SELECTION} }
    }
  }
`;

/** As above, restricted to one locale. */
export const PAGE_BY_PATH_LOCALE_QUERY = `
  query PageByPathLocale($path: String!, $locale: String!) {
    _Experience(
      where: {
        _metadata: {
          url: { default: { eq: $path } }
          locale: { eq: $locale }
        }
      }
      limit: 1
    ) {
      items { ${PAGE_SELECTION} }
    }
  }
`;

/**
 * Fallback for paths that are not Experience pages. `_Content` is the root
 * interface and is present on every instance; `_Page` is instance-specific,
 * so it is deliberately not queried here.
 */
export const CONTENT_BY_PATH_QUERY = `
  query ContentByPath($path: String!) {
    _Content(
      where: { _metadata: { url: { default: { eq: $path } } } }
      limit: 1
    ) {
      items { ${PAGE_METADATA_SELECTION} }
    }
  }
`;

export const CONTENT_BY_PATH_LOCALE_QUERY = `
  query ContentByPathLocale($path: String!, $locale: String!) {
    _Content(
      where: {
        _metadata: {
          url: { default: { eq: $path } }
          locale: { eq: $locale }
        }
      }
      limit: 1
    ) {
      items { ${PAGE_METADATA_SELECTION} }
    }
  }
`;

/** Draft content by key — read with the CMS-supplied preview token. */
export const PREVIEW_BY_KEY_QUERY = `
  query PreviewByKey($key: String!) {
    _Experience(where: { _metadata: { key: { eq: $key } } }, limit: 1) {
      items { ${PAGE_SELECTION} }
    }
  }
`;

/** Draft content pinned to one exact version. */
export const PREVIEW_BY_KEY_VERSION_QUERY = `
  query PreviewByKeyVersion($key: String!, $version: String!) {
    _Experience(
      where: { _metadata: { key: { eq: $key }, version: { eq: $version } } }
      limit: 1
    ) {
      items { ${PAGE_SELECTION} }
    }
  }
`;

/* -------------------------------------------------------------------------- */
/* Site chrome                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Site furniture lives in four singleton content types. Each is selected with
 * `(limit: 1) { item { ... } }` — `item`, NOT `items`: Graph rejects `_json`
 * under `items`.
 *
 * `_json` returns the whole authored tree in one go, so the arbitrarily deep
 * NavigationItem nesting (label / href / description / openInNewTab / children)
 * needs no recursive selection and no query change when the CMS gains a level.
 */
const CHROME_ITEM_SELECTION = `
  item {
    _metadata { key locale }
    _json
  }
`;

export const SITE_CHROME_QUERY = `
  query SiteChrome {
    Navigation(limit: 1) { ${CHROME_ITEM_SELECTION} }
    Footer(limit: 1) { ${CHROME_ITEM_SELECTION} }
    SiteBanner(limit: 1) { ${CHROME_ITEM_SELECTION} }
    SiteSettings(limit: 1) { ${CHROME_ITEM_SELECTION} }
  }
`;

/** As above, restricted to one locale. */
export const SITE_CHROME_LOCALE_QUERY = `
  query SiteChromeLocale($locale: String!) {
    Navigation(
      where: { _metadata: { locale: { eq: $locale } } }
      limit: 1
    ) { ${CHROME_ITEM_SELECTION} }
    Footer(
      where: { _metadata: { locale: { eq: $locale } } }
      limit: 1
    ) { ${CHROME_ITEM_SELECTION} }
    SiteBanner(
      where: { _metadata: { locale: { eq: $locale } } }
      limit: 1
    ) { ${CHROME_ITEM_SELECTION} }
    SiteSettings(
      where: { _metadata: { locale: { eq: $locale } } }
      limit: 1
    ) { ${CHROME_ITEM_SELECTION} }
  }
`;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* _json normalisation                                                        */
/* -------------------------------------------------------------------------- */

/** Depth cap mirrors the renderer's: malformed data must not blow the stack. */
const MAX_NORMALISE_DEPTH = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Flattens `component._json` onto the component itself, so blocks read
 * `data.headline` rather than `data._json.headline`. `_metadata` from the
 * typed selection wins over the copy inside `_json`, because the typed one is
 * what the renderer and the registry match on.
 */
function normaliseComponent(component: unknown): unknown {
  if (!isRecord(component)) return component;
  const json = component._json;
  if (!isRecord(json)) return component;

  const rest = { ...component };
  delete rest._json;
  return { ...json, ...rest };
}

/** Walks a composition tree and normalises every component node in place. */
function normaliseComposition(node: unknown, depth = 0): void {
  if (!isRecord(node) || depth > MAX_NORMALISE_DEPTH) return;

  if ("component" in node) {
    node.component = normaliseComponent(node.component);
  }

  const children = node.nodes;
  if (Array.isArray(children)) {
    for (const child of children) normaliseComposition(child, depth + 1);
  }
}

/** Returns the page with its composition normalised. Null passes through. */
function normalisePage(page: ExperiencePage | null): ExperiencePage | null {
  if (page) normaliseComposition(page.composition);
  return page;
}

type ExperienceResult = {
  _Experience?: { items?: (ExperiencePage | null)[] | null } | null;
};

type ContentResult = {
  _Content?: { items?: (ExperiencePage | null)[] | null } | null;
};

const MAX_PATH_LENGTH = 1024;
/** Locale tags only: letters, digits and hyphens (e.g. "en", "en-GB"). */
const LOCALE_PATTERN = /^[A-Za-z0-9-]{2,35}$/;
/** Graph keys/versions are opaque ids; allow only id-safe characters. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function firstItem(
  items: (ExperiencePage | null)[] | null | undefined,
): ExperiencePage | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (item) return item;
  }
  return null;
}

/**
 * Normalise an untrusted request path to the form Graph stores in
 * `_metadata.url.default`: always a leading and trailing slash, no duplicate
 * slashes, no query string or fragment. Returns undefined when the input
 * cannot be used (over-long, or not a string).
 */
export function normalisePath(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  if (input.length > MAX_PATH_LENGTH) return undefined;

  // Strip query and fragment, and anything after a NUL.
  let path = input.split("#")[0]?.split("?")[0] ?? "";
  if (path.includes("\0")) return undefined;

  path = path.replace(/\/+/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path = `${path}/`;

  if (path.length > MAX_PATH_LENGTH) return undefined;
  return path;
}

function normaliseLocale(locale: string | undefined): string | undefined {
  if (typeof locale !== "string") return undefined;
  const trimmed = locale.trim();
  return LOCALE_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Published page for a URL path. Tries the Experience lookup first and falls
 * back to generic content. Returns null when nothing matches; GraphError from
 * the transport propagates to the caller.
 */
export async function getPageByPath(
  path: string,
  locale?: string,
): Promise<ExperiencePage | null> {
  const normalisedPath = normalisePath(path);
  if (!normalisedPath) return null;

  const normalisedLocale = normaliseLocale(locale);
  const variables: Record<string, unknown> = normalisedLocale
    ? { path: normalisedPath, locale: normalisedLocale }
    : { path: normalisedPath };

  const experience = await graphQuery<ExperienceResult>({
    query: normalisedLocale ? PAGE_BY_PATH_LOCALE_QUERY : PAGE_BY_PATH_QUERY,
    variables,
  });

  const page = firstItem(experience?._Experience?.items);
  if (page) return normalisePage(page);

  const content = await graphQuery<ContentResult>({
    query: normalisedLocale
      ? CONTENT_BY_PATH_LOCALE_QUERY
      : CONTENT_BY_PATH_QUERY,
    variables,
  });

  return normalisePage(firstItem(content?._Content?.items));
}

/* -------------------------------------------------------------------------- */
/* Published page list (sitemap)                                              */
/* -------------------------------------------------------------------------- */

/** Graph caps `limit` at 100, so the list is read in pages of that size. */
const PATH_LIST_PAGE_SIZE = 100;
/**
 * Hard ceiling on items read, so a wrong or hostile `total` cannot loop forever.
 * Well under the 50,000-URL limit of a single sitemap file.
 */
const PATH_LIST_MAX_ITEMS = 5000;
/** The list changes only on publish; an hour is plenty for search engines. */
const PATH_LIST_REVALIDATE_SECONDS = 3600;
/**
 * Same shape the published route accepts: slash-delimited segments of unreserved
 * URL characters, leading and trailing slash. Anything else is left out of the
 * sitemap rather than advertised.
 */
const LISTED_PATH_PATTERN = /^\/(?:[A-Za-z0-9\-_.~%]+\/)*$/;

export const PUBLISHED_PATHS_QUERY = `
  query PublishedPaths($skip: Int!) {
    _Experience(limit: ${PATH_LIST_PAGE_SIZE}, skip: $skip) {
      total
      items { _metadata { url { default } published } }
    }
  }
`;

type PublishedPathsResult = {
  _Experience?: {
    total?: number | null;
    items?: ({ _metadata?: { url?: { default?: string | null } | null; published?: string | null } | null } | null)[] | null;
  } | null;
};

export type PublishedPath = {
  /** Site-relative path as Graph stores it, e.g. "/en/business/pricing/". */
  path: string;
  /** ISO timestamp of the latest publish, when Graph reports a valid one. */
  published?: string;
};

/**
 * Every published Experience page's path, de-duplicated (Graph can return the same
 * URL more than once, e.g. per version), keeping the newest publish date.
 * GraphError propagates to the caller.
 */
export async function getPublishedPaths(): Promise<PublishedPath[]> {
  const byPath = new Map<string, PublishedPath>();

  for (let skip = 0; skip < PATH_LIST_MAX_ITEMS; skip += PATH_LIST_PAGE_SIZE) {
    const result = await graphQuery<PublishedPathsResult>({
      query: PUBLISHED_PATHS_QUERY,
      variables: { skip },
      revalidate: PATH_LIST_REVALIDATE_SECONDS,
    });

    const items = result?._Experience?.items ?? [];
    for (const item of items) {
      const path = normalisePath(item?._metadata?.url?.default);
      if (!path || path.includes("..") || !LISTED_PATH_PATTERN.test(path)) continue;

      const rawPublished = item?._metadata?.published;
      const published =
        typeof rawPublished === "string" && !Number.isNaN(Date.parse(rawPublished)) ? rawPublished : undefined;

      const existing = byPath.get(path);
      const isNewer = published !== undefined && (existing?.published === undefined || Date.parse(published) > Date.parse(existing.published));
      if (!existing || isNewer) byPath.set(path, published ? { path, published } : { path });
    }

    const total = result?._Experience?.total;
    if (items.length < PATH_LIST_PAGE_SIZE || typeof total !== "number" || skip + PATH_LIST_PAGE_SIZE >= total) break;
  }

  return [...byPath.values()];
}

export type PreviewArgs = {
  key: string;
  version?: string;
  locale?: string;
  previewToken: string;
};

/**
 * Draft content for the CMS preview iframe. The token authorises the read and
 * is passed to graphQuery only — it is never part of the query or variables.
 */
export async function getPreviewContent(
  args: PreviewArgs,
): Promise<ExperiencePage | null> {
  const { key, version, previewToken } = args;

  if (typeof previewToken !== "string" || previewToken.length === 0) return null;
  if (typeof key !== "string" || !ID_PATTERN.test(key)) return null;

  const hasVersion = typeof version === "string" && ID_PATTERN.test(version);
  const variables: Record<string, unknown> = hasVersion
    ? { key, version }
    : { key };

  const result = await graphQuery<ExperienceResult>({
    query: hasVersion ? PREVIEW_BY_KEY_VERSION_QUERY : PREVIEW_BY_KEY_QUERY,
    variables,
    previewToken,
  });

  return normalisePage(firstItem(result?._Experience?.items));
}

/* -------------------------------------------------------------------------- */
/* Site chrome                                                                */
/* -------------------------------------------------------------------------- */

/** Chrome changes far less often than page content, so it is cached longer. */
const CHROME_REVALIDATE_SECONDS = 300;

type ChromeSlot = { item?: unknown } | null | undefined;

type SiteChromeResult = {
  Navigation?: ChromeSlot;
  Footer?: ChromeSlot;
  SiteBanner?: ChromeSlot;
  SiteSettings?: ChromeSlot;
};

const EMPTY_CHROME: SiteChrome = {
  navigation: null,
  footer: null,
  banner: null,
  settings: null,
};

/**
 * Flattens one chrome slot's `_json` onto the item, reusing the same
 * normaliser the composition tree uses so blocks and chrome read alike.
 */
function normaliseChromeSlot(slot: ChromeSlot): ChromeItem | null {
  if (!isRecord(slot)) return null;
  const normalised = normaliseComponent(slot.item);
  return isRecord(normalised) ? (normalised as ChromeItem) : null;
}

/**
 * Header, footer, banner and settings in ONE cached Graph request.
 *
 * This function never throws out to the caller: the chrome is decoration, and a
 * Graph failure must not take down the page it wraps. GraphError is logged
 * server-side and all four parts come back null, so layouts render without
 * chrome rather than erroring. Unexpected (non-GraphError) failures are
 * deliberately left to propagate — they are bugs, not upstream outages.
 */
export async function getSiteChrome(locale?: string): Promise<SiteChrome> {
  const normalisedLocale = normaliseLocale(locale);

  try {
    const result = await graphQuery<SiteChromeResult>({
      query: normalisedLocale ? SITE_CHROME_LOCALE_QUERY : SITE_CHROME_QUERY,
      variables: normalisedLocale ? { locale: normalisedLocale } : {},
      revalidate: CHROME_REVALIDATE_SECONDS,
    });

    return {
      navigation: normaliseChromeSlot(result?.Navigation),
      footer: normaliseChromeSlot(result?.Footer),
      banner: normaliseChromeSlot(result?.SiteBanner),
      settings: normaliseChromeSlot(result?.SiteSettings),
    };
  } catch (cause) {
    if (cause instanceof GraphError) {
      console.error("[chrome] site chrome unavailable", cause);
      return EMPTY_CHROME;
    }
    throw cause;
  }
}
