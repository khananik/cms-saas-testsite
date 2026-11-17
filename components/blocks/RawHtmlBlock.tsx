import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickString } from "@/lib/fields";
import { sanitizeAuthoredHtml } from "@/lib/sanitize";

import styles from "./RawHtmlBlock.module.css";

/**
 * Author-supplied markup from the CMS.
 *
 * SECURITY: `sanitizeAuthoredHtml` is the security control for this block. It runs
 * the author's markup through lib/sanitize.ts — an explicit tag, attribute, CSS
 * property and URI-scheme allowlist — and its return value is the ONLY thing
 * permitted to reach dangerouslySetInnerHTML here. Do not remove it, do not swap it
 * for pickString alone, and never add a prop or field path that lets a caller pass
 * markup straight through: CMS editors are not a trusted source of HTML, so
 * unsanitised markup would be stored XSS on every page that renders this block.
 *
 * This block, and only this block, uses the PERMISSIVE profile: editors paste whole
 * page sections here, so inline styles and a filtered <style> element survive, while
 * everything that can execute (script, iframe/object/embed, on* handlers,
 * javascript:/vbscript: URLs, srcdoc/formaction) is still removed. Every other block
 * keeps the strict rich-text profile via `pickHtml`; do not point any of them at
 * `sanitizeAuthoredHtml`.
 */
export default function RawHtmlBlock({ data, ctx }: BlockComponentProps) {
  const html = sanitizeAuthoredHtml(
    pickString(
      data,
      "html",
      "rawHtml",
      "htmlContent",
      "markup",
      "embedCode",
      "code",
      "content",
      "body",
      "text",
    ),
  );

  // Nothing survived sanitising (or there was nothing to begin with) -> render nothing.
  if (!html) return null;

  const label = pickString(data, "ariaLabel", "accessibleLabel", "heading", "title", "name");

  return (
    <section className={styles.block} aria-label={label}>
      <div
        className={styles.inner}
        // Containment, not decoration: `position: relative` makes this div the
        // containing block for any absolutely positioned authored element, and
        // `isolation: isolate` opens a stacking context so an authored z-index
        // cannot be stacked over site chrome. Together with the sanitiser's ban on
        // `position: fixed`, authored CSS stays inside the block it belongs to.
        style={{ position: "relative", isolation: "isolate" }}
        {...editable(
          ctx,
          data,
          "html",
          "rawHtml",
          "htmlContent",
          "markup",
          "embedCode",
          "code",
          "content",
          "body",
          "text",
        )}
        // Sanitised above by sanitizeAuthoredHtml. Never pass unsanitised input here.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
