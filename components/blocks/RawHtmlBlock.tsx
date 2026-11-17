import type { BlockComponentProps } from "@/components/registry";
import { pickHtml, pickString } from "@/lib/fields";

import styles from "./RawHtmlBlock.module.css";

/**
 * Author-supplied markup from the CMS.
 *
 * SECURITY: `pickHtml` is the security control for this block. It runs the author's
 * markup through lib/sanitize.ts (isomorphic-dompurify with an explicit tag,
 * attribute and URI-scheme allowlist) and is the ONLY value permitted to reach
 * dangerouslySetInnerHTML here. Do not remove it, do not swap it for pickString,
 * and never add a prop or field path that lets a caller pass markup straight
 * through — CMS editors are not a trusted source of HTML, so unsanitised markup
 * would be stored XSS on every page that renders this block.
 */
export default function RawHtmlBlock({ data }: BlockComponentProps) {
  const html = pickHtml(
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
  );

  // Nothing survived sanitising (or there was nothing to begin with) -> render nothing.
  if (!html) return null;

  const label = pickString(data, "ariaLabel", "accessibleLabel", "heading", "title", "name");

  return (
    <section className={styles.block} aria-label={label}>
      <div
        className={styles.inner}
        // Sanitised above by pickHtml -> sanitizeHtml. Never pass unsanitised input here.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
