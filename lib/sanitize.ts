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

/* ===========================================================================
 * PERMISSIVE PROFILE — CMS-authored page sections (RawHtmlBlock ONLY)
 * ===========================================================================
 *
 * The strict profile above is for RICH TEXT: a prose fragment inside a layout we
 * control. RawHtmlBlock is different — editors paste whole page sections there,
 * complete with a <style> element and namespaced classes, and the strict profile
 * throws all of that away, so those sections render unstyled.
 *
 * This profile therefore relaxes PRESENTATION and nothing else:
 *   - inline `style`, through an explicit property allowlist with value regexes;
 *   - a <style> element whose CSS text is run through `filterCssText` below;
 *   - a wider TAG list (sectioning, description lists, inline semantics) because
 *     widening tags is far cheaper, security-wise, than widening attributes.
 *
 * Everything that can execute stays out, exactly as before: no <script>, no
 * <iframe>/<object>/<embed>, no on* handlers, no srcdoc/formaction, no
 * javascript:/vbscript: URLs, no SVG (its animation and <script> elements are a
 * scripting surface of their own).
 *
 * TRUST BOUNDARY: allowing <style> at all is only defensible because this markup
 * comes from authenticated CMS editors whose content goes through editorial
 * review. It must NEVER be applied to public, anonymous or end-user input, and
 * `sanitizeAuthoredHtml` must not be reachable from any block other than
 * RawHtmlBlock. A stylesheet is global to the page: see filterCssText's note.
 */

const AUTHORED_TAGS: string[] = [
  ...ALLOWED_TAGS,
  "style",
  // Sectioning and page furniture — authored sections are whole page regions.
  "section", "article", "header", "footer", "main", "nav", "aside",
  // Description lists and disclosure widgets.
  "dl", "dt", "dd", "details", "summary",
  // Inline semantics used by editorial copy.
  "small", "sub", "sup", "mark", "abbr", "cite", "q", "time",
  "s", "del", "ins", "kbd", "samp", "var",
  // Inert without a form and without JS; authors style it as a label/pill.
  // "Buttons" that navigate are <a> elements and go through the href allowlist.
  "button",
];

/**
 * Global attributes, plus `style` and ARIA. `style` is safe to widen ONLY because
 * `allowedStyles` below is a property allowlist with per-property value regexes —
 * an unlisted property is dropped outright, so there is no "any CSS" path here.
 * Still no data-*, no event handlers, no srcdoc/formaction.
 */
const AUTHORED_GLOBAL_ATTR: string[] = [...GLOBAL_ATTR, "style", "role", "aria-*"];

const AUTHORED_ATTRIBUTES: Record<string, string[]> = {
  "*": AUTHORED_GLOBAL_ATTR,
  a: [...AUTHORED_GLOBAL_ATTR, "href", "target", "rel", "name"],
  img: [...AUTHORED_GLOBAL_ATTR, "src", "alt", "width", "height", "loading", "decoding"],
  td: [...AUTHORED_GLOBAL_ATTR, "colspan", "rowspan", "headers"],
  th: [...AUTHORED_GLOBAL_ATTR, "colspan", "rowspan", "scope", "headers"],
  col: [...AUTHORED_GLOBAL_ATTR, "span"],
  colgroup: [...AUTHORED_GLOBAL_ATTR, "span"],
  time: [...AUTHORED_GLOBAL_ATTR, "datetime"],
  details: [...AUTHORED_GLOBAL_ATTR, "open"],
  // `type` keeps a stray <button> from submitting anything; `formaction` is absent.
  button: [...AUTHORED_GLOBAL_ATTR, "type", "disabled"],
};

/*
 * ---- inline style values -------------------------------------------------
 *
 * Two value regexes cover every allowed property:
 *
 *  CSS_VALUE     the general one. Its character class deliberately excludes
 *                ":" ";" "{" "}" "<" ">" "\" "@" and "&", which alone makes
 *                `javascript:`, `data:`, at-rules, extra declarations and markup
 *                breakout unrepresentable. The leading lookahead then bans the
 *                legacy code-execution constructs by name — expression(),
 *                behavior/-moz-binding, and url()/image-set()/element(), i.e.
 *                NO external references at all from an inline style. Authors who
 *                need a background image use the <style> element, where
 *                filterCssText applies a real scheme check.
 *
 *  CSS_POSITION  `position`, minus `fixed`: a fixed element escapes the block and
 *                can cover the whole viewport (clickjacking / full-page overlay).
 *                `absolute` and `sticky` stay, and RawHtmlBlock contains them by
 *                giving its wrapper a positioned, isolated stacking context.
 */
const CSS_NO_CODE = "(?!.*(?:expression|behaviou?r|binding|url|image-set|element)\\s*[(:])";
const CSS_SAFE_CHARS = "[A-Za-z0-9\\s.,%#()/_'\"+*-]";
const CSS_VALUE = new RegExp(`^${CSS_NO_CODE}${CSS_SAFE_CHARS}*$`, "i");
const CSS_POSITION = /^(?:static|relative|absolute|sticky|-webkit-sticky)$/i;

/** Properties an authored section legitimately needs: layout, typography, colour. */
const CSS_PROPERTIES: string[] = [
  // box / layout
  "display", "visibility", "box-sizing", "float", "clear",
  "overflow", "overflow-x", "overflow-y", "object-fit", "object-position",
  "top", "right", "bottom", "left", "z-index",
  "width", "min-width", "max-width", "height", "min-height", "max-height", "aspect-ratio",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  // flexbox / grid
  "flex", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-self", "align-content",
  "justify-content", "justify-items", "justify-self", "order",
  "gap", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-template-areas",
  "grid-column", "grid-row", "grid-area", "grid-auto-flow", "grid-auto-columns", "grid-auto-rows",
  // typography
  "color", "font", "font-family", "font-size", "font-style", "font-weight", "font-variant",
  "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-align-last", "text-indent", "text-transform", "text-shadow", "text-wrap",
  "text-decoration", "text-decoration-color", "text-decoration-line", "text-decoration-style",
  "text-underline-offset", "white-space", "word-break", "overflow-wrap", "hyphens",
  "vertical-align", "list-style", "list-style-type", "list-style-position",
  // colour / decoration
  "background", "background-color", "background-image", "background-position",
  "background-size", "background-repeat", "background-clip", "background-origin",
  "background-attachment", "opacity", "mix-blend-mode", "isolation", "filter", "box-shadow",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-width", "border-style", "border-color",
  "border-top-width", "border-top-style", "border-top-color",
  "border-right-width", "border-right-style", "border-right-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "border-radius", "border-top-left-radius", "border-top-right-radius",
  "border-bottom-left-radius", "border-bottom-right-radius",
  "outline", "outline-color", "outline-offset", "outline-style", "outline-width",
  // tables
  "border-collapse", "border-spacing", "table-layout", "caption-side", "empty-cells",
  // motion (presentational only; no @keyframes can be referenced from an attribute)
  "transform", "transform-origin",
  "transition", "transition-delay", "transition-duration",
  "transition-property", "transition-timing-function",
  "scroll-margin-top", "cursor",
];

const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  "*": {
    ...Object.fromEntries(CSS_PROPERTIES.map((prop) => [prop, [CSS_VALUE]])),
    position: [CSS_POSITION],
  },
};

/* ---- <style> CSS text filter -------------------------------------------- */

/** `/* … *\/` comments. Stripped first so they cannot hide the tokens below. */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
/** `<` that could start a tag or `</style>` and break out of the raw-text element. */
const CSS_MARKUP_OPEN = /<(?=[/!a-zA-Z])/g;
/** At-rules that pull in or reinterpret an external resource. */
/**
 * Banned at-rules, consumed WHOLE. The body alternation steps over quoted strings
 * and parenthesised groups before looking for the terminating ";", because a URL
 * legitimately contains semicolons — a Google Fonts import carries
 * `family=Inter:wght@400;500;600`. A naive `[^;{}]*` ends at the first of those and
 * leaves the rest of the URL behind as garbage at the top of the stylesheet.
 * @media, @supports, @font-face and @keyframes are deliberately NOT banned: they
 * are presentational and are needed by real authored sections.
 */
const CSS_BANNED_AT_RULE =
  /@(?:import|charset|namespace|document)\b(?:[^;{}'"()]|'[^']*'|"[^"]*"|\([^()]*\))*(?:;|(?=[{}])|$)/gi;
/**
 * Every `url(...)` token, so its scheme can be checked. The unquoted branch
 * tolerates one level of nested parentheses so that a hostile `url(javascript:
 * alert(1))` is consumed whole rather than leaving a stray `)` behind.
 */
const CSS_URL_CALL = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^'"()]*(?:\([^()]*\)[^'"()]*)*))\s*\)/gi;
/** A whole declaration containing a legacy code-execution or overlay construct. */
const CSS_BANNED_DECL =
  /(^|[;{])[^;{}]*?(?:expression\s*\(|behaviou?r\s*:|-moz-binding|javascript\s*:|vbscript\s*:|position\s*:\s*fixed)[^;{}]*/gi;

/**
 * CSS escapes (`\3c`, `\65`) mean the same as the character they encode, so an
 * attacker can spell `expression(` as `\65 xpression(` and a naive token filter
 * misses it. Decoding the ASCII range FIRST makes the filters below see the real
 * text. Non-ASCII escapes are left alone.
 */
function decodeCssEscapes(css: string): string {
  return css
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\f\r]?/g, (match: string, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code < 0x7f ? String.fromCharCode(code) : match;
    })
    .replace(/\\([^\r\n\f0-9a-fA-F])/g, "$1");
}

/** http(s) and data:image only. Relative URLs (no scheme) stay; `//host` does not. */
function isSafeCssUrl(value: string): boolean {
  const url = value.trim();
  if (url.length === 0) return false;
  if (url.startsWith("//")) return false; // protocol-relative: inherits http on http
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (scheme === null) return true; // relative / same-origin
  const name = (scheme[1] ?? "").toLowerCase();
  if (name === "http" || name === "https") return true;
  return name === "data" && /^data:image\//i.test(url);
}

/**
 * Filters the CSS text of an authored <style> element.
 *
 * TRUSTED-EDITOR CONTENT ONLY. A <style> element is global to the page: even
 * after this filter, authored CSS can restyle or hide anything on it. That is
 * acceptable for CMS content written by authenticated editors and reviewed before
 * publication, and it is NOT acceptable for public or end-user input. Do not call
 * this on anything that is not editorial content.
 *
 * Removed, in order:
 *   1. comments            — otherwise `expr/*x*\/ession(` slips past the filters
 *   2. CSS escapes         — decoded to ASCII so obfuscation becomes visible
 *   3. `<` before / ! or a letter  — no `</style>` breakout into live markup
 *   4. @import/@charset/@namespace/@document  — no external stylesheet loading
 *   5. url(...) whose scheme is not http(s) or data:image  — replaced with `none`
 *   6. any declaration containing expression(), behavior:, -moz-binding,
 *      javascript:, vbscript: or position:fixed
 */
export function filterCssText(css: string): string {
  const decoded = decodeCssEscapes(css).replace(CSS_COMMENT, "");
  return decoded
    .replace(CSS_MARKUP_OPEN, "")
    .replace(CSS_BANNED_AT_RULE, "")
    .replace(
      CSS_URL_CALL,
      (match: string, single?: string, double?: string, bare?: string) =>
        isSafeCssUrl(single ?? double ?? bare ?? "") ? match : "none",
    )
    .replace(CSS_BANNED_DECL, "$1")
    .trim();
}

/** Rewrites the CSS text of every <style> element the sanitiser kept. */
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

const AUTHORED_OPTIONS: sanitize.IOptions = {
  ...OPTIONS,
  allowedTags: AUTHORED_TAGS,
  allowedAttributes: AUTHORED_ATTRIBUTES,
  allowedStyles: ALLOWED_STYLES,
  // sanitize-html hands `style` attribute values to postcss and drops anything
  // ALLOWED_STYLES does not match. Without this, allowedStyles is an error.
  parseStyleAttributes: true,
  // <style> is in allowedTags on purpose (see the trust-boundary note above), so
  // it must not also be in nonTextTags — and the library's blanket warning about
  // it is acknowledged here rather than printed on every render.
  nonTextTags: ["script", "textarea", "option", "noscript", "iframe", "object", "embed"],
  allowVulnerableTags: true,
};

/**
 * Sanitises CMS-authored page-section markup — RawHtmlBlock and nothing else.
 * Keeps presentation (inline styles, a filtered <style> element, classes);
 * removes everything that can execute. Returns "" for non-strings and never throws.
 */
export function sanitizeAuthoredHtml(dirty: unknown): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  try {
    return sanitize(dirty, AUTHORED_OPTIONS)
      .replace(STYLE_ELEMENT, (_match: string, css: string) => {
        const clean = filterCssText(css);
        return clean.length > 0 ? `<style>${clean}</style>` : "";
      })
      .replace(EVENT_HANDLER_ATTR, "");
  } catch {
    // Fail closed, as above: render nothing rather than unsanitised markup.
    return "";
  }
}
