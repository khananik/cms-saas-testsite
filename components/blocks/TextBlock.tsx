import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickHtml } from "@/lib/fields";

import styles from "./TextBlock.module.css";

/**
 * Long-form prose. The one authored field is `body`, a RichText { html, json }.
 *
 * SECURITY: `pickHtml` is the security control here. It reads the RichText `html`
 * and runs it through lib/sanitize.ts (explicit tag / attribute / URI-scheme
 * allowlist, every script-capable tag and on* handler removed). Its return value
 * is the ONLY thing permitted to reach dangerouslySetInnerHTML in this file. Do
 * not swap it for a raw read of `data`, and do not add a prop that lets markup
 * bypass it — CMS editors are not a trusted source of HTML, so unsanitised rich
 * text would be stored XSS on every blog page that renders this block.
 */
export default function TextBlock({ data, ctx }: BlockComponentProps) {
  const bodyHtml = pickHtml(data, "body", "text", "content", "mainBody");

  // Empty, absent, or nothing survived sanitising -> render nothing.
  if (!bodyHtml) return null;

  return (
    <section className={styles.block}>
      <div
        className={styles.prose}
        // Same candidate names, same order, as the pickHtml call above.
        {...editable(ctx, data, "body", "text", "content", "mainBody")}
        // Sanitised above by pickHtml -> sanitizeHtml. Never pass unsanitised input here.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </section>
  );
}
