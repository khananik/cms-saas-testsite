import DOMPurify from "isomorphic-dompurify";

/**
 * HTML sanitiser for CMS rich text / RawHtmlBlock.
 * Explicit allowlist: anything not named here is removed, including every
 * script-capable tag, every on* handler, style/srcdoc/formaction and non-http(s) URIs.
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

const ALLOWED_ATTR: string[] = [
  "href", "title", "lang", "dir",
  "src", "alt", "width", "height", "loading",
  "colspan", "rowspan", "scope",
  "id", "class",
];

const FORBID_TAGS: string[] = [
  "script", "style", "iframe", "object", "embed",
  "form", "input", "button", "textarea", "select",
  "link", "meta", "base", "svg", "math",
];

const FORBID_ATTR: string[] = [
  "style", "srcdoc", "formaction", "action", "ping", "srcset",
  "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur",
  "onanimationstart", "onanimationend", "ontoggle", "onbegin", "onended",
];

// http(s), mailto, tel, or relative. No javascript:, data: or vbscript:.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let hookInstalled = false;

function installHooks(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element): void => {
    if (typeof node.getAttribute !== "function") return;
    // Any on* attribute that survived parsing is stripped defensively.
    for (const attr of Array.from(node.attributes ?? [])) {
      if (attr.name.toLowerCase().startsWith("on")) {
        node.removeAttribute(attr.name);
      }
    }
    if (node.tagName?.toLowerCase() === "a" && node.getAttribute("target") === "_blank") {
      // Prevents reverse-tabnabbing and referrer leakage on CMS-authored links.
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

/** Returns sanitised HTML, or "" for any non-string input. Never throws. */
export function sanitizeHtml(dirty: unknown): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  installHooks();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_URI_REGEXP,
    ADD_ATTR: ["rel", "target"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  }) as string;
}
