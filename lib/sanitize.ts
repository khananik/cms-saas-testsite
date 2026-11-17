import sanitize from "sanitize-html";

/**
 * HTML sanitiser for CMS rich text and RawHtmlBlock.
 *
 * Explicit allowlist: anything not named here is removed — every script-capable
 * tag, every on* handler, style/srcdoc/formaction, and any non-http(s) URI scheme.
 *
 * Why sanitize-html and not DOMPurify: this module is reached from client
 * components as well as server ones, so the sanitiser has to run in both. DOMPurify
 * needs a DOM, and the usual Node shim (isomorphic-dompurify -> jsdom) cannot be
 * loaded by Vercel's bundled runtime — jsdom's html-encoding-sniffer require()s an
 * ESM module and throws ERR_REQUIRE_ESM at import time, which took down every
 * route. sanitize-html parses with htmlparser2 and needs no DOM at all.
 */

const ALLOWED_TAGS: string[] = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u",
  "a", "blockquote", "code", "pre",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "img", "span", "div", "figure", "figcaption",
];

/**
 * Attributes are allowlisted per tag. Global attributes are deliberately narrow:
 * no `style` (CSS-based exfiltration and layout hijacking), no `data-*`, no event
 * handlers. ARIA attributes are permitted so authored markup stays accessible.
 */
const GLOBAL_ATTR: string[] = ["title", "lang", "dir", "id", "class"];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  "*": GLOBAL_ATTR,
  a: [...GLOBAL_ATTR, "href", "target", "rel", "name"],
  img: [...GLOBAL_ATTR, "src", "alt", "width", "height", "loading", "decoding"],
  td: [...GLOBAL_ATTR, "colspan", "rowspan", "headers"],
  th: [...GLOBAL_ATTR, "colspan", "rowspan", "scope", "headers"],
  col: [...GLOBAL_ATTR, "span"],
  colgroup: [...GLOBAL_ATTR, "span"],
};

/** Only these schemes may appear in href/src. javascript:, data: and vbscript: are not here. */
const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"];

const OPTIONS: sanitize.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: { a: ALLOWED_SCHEMES, img: ["http", "https"] },
  // A relative URL has no scheme; permitting them is what lets authored links
  // point at other pages on this site.
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // Keep the text of a disallowed tag, but drop these outright: their content is
  // code or metadata, never prose, and leaving it would dump script source as text.
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
  // ARIA is useful and inert; data-* is not needed and widens the surface.
  allowedClasses: false as unknown as sanitize.IOptions["allowedClasses"],
  enforceHtmlBoundary: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // Reverse-tabnabbing and referrer leakage on CMS-authored links.
    a: (tagName, attribs) => {
      const next: Record<string, string> = { ...attribs };
      if (next.target === "_blank") {
        next.rel = "noopener noreferrer nofollow";
      }
      return { tagName, attribs: next };
    },
  },
};

/**
 * Belt and braces: sanitize-html's allowlist already drops unknown attributes, so
 * nothing matching this should survive. It is here so that a future widening of the
 * attribute allowlist cannot silently let an event handler through.
 */
const EVENT_HANDLER_ATTR = /\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Returns sanitised HTML, or "" for any non-string input. Never throws. */
export function sanitizeHtml(dirty: unknown): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  try {
    return sanitize(dirty, OPTIONS).replace(EVENT_HANDLER_ATTR, "");
  } catch {
    // Fail closed: if the parser ever throws on hostile input, render nothing
    // rather than falling back to the unsanitised string.
    return "";
  }
}
