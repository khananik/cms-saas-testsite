import type { ChromeItem, RenderContext } from "@/lib/types";
import { editable } from "@/lib/edit";
import { matchedFieldName, pickLink, pickString } from "@/lib/fields";
import { safeHref } from "@/lib/url";

import styles from "./SiteBannerBar.module.css";

export type SiteBannerBarProps = {
  /** The `SiteBanner` chrome item, already `_json`-flattened. Null when unauthored. */
  banner: ChromeItem | null | undefined;
  ctx?: RenderContext | null;
};

/**
 * Authored tone. `info` is the house default and renders on the dark fir surface
 * with lfgreen as the accent — the one place that bright green is legible, and the
 * brand's signature pairing. The other three exist because the CMS enum allows
 * them; each is mapped to a brand surface that clears AA for its own text colour.
 */
type Variant = "info" | "success" | "warning" | "alert";

const VARIANTS: readonly Variant[] = ["info", "success", "warning", "alert"];

/** Tolerates "Info", " SUCCESS ", etc. Anything unrecognised falls back to `info`. */
function toVariant(value: string | undefined): Variant {
  if (value === undefined) return "info";
  const normalised = value.trim().toLowerCase();
  return VARIANTS.find((variant) => variant === normalised) ?? "info";
}

/**
 * `enabled` is a CMS boolean, and lib/fields.ts has no boolean reader (pickString
 * and pickNumber both return undefined for `true`). The property NAME is still
 * resolved through fields.ts rather than guessed, so casing differences between
 * instances behave exactly as they do everywhere else; only the already-matched
 * key is read back.
 *
 * Fails closed on purpose: anything that is not an affirmative value — absent,
 * null, "false", 0, an object — means the banner does not render.
 */
function isEnabled(data: ChromeItem | null | undefined): boolean {
  const name = matchedFieldName(data, "enabled", "isEnabled", "active", "show", "visible");
  if (name === undefined || data === null || data === undefined) return false;
  const value = data[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    return normalised === "true" || normalised === "yes" || normalised === "on" || normalised === "1";
  }
  return false;
}

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * The announcement strip that sits above the site header.
 *
 * Renders nothing at all — no wrapper, no spacing — unless the CMS has the banner
 * switched on AND there is a message to show.
 */
export default function SiteBannerBar({ banner: data, ctx }: SiteBannerBarProps) {
  if (!isEnabled(data)) return null;

  const message = pickString(data, "message", "text", "body", "label", "title");
  if (!message) return null;

  const variant = toVariant(pickString(data, "variant", "tone", "style", "type"));

  // `linkUrl` arrives as a bare string. pickLink allowlists it, and safeHref is
  // applied again here so the guard is visible at the point of use: an href is
  // only ever rendered for a value that passed the allowlist.
  const linkNode = pickLink(data, "linkUrl", "link", "url", "href", "ctaLink");
  const href = safeHref(linkNode?.href);
  const linkText = pickString(data, "linkText", "linkLabel", "ctaLabel", "linkTitle") ?? linkNode?.label;

  return (
    <aside className={styles.bar} data-variant={variant} aria-label="Site announcement">
      <div className={styles.inner}>
        <span className={styles.dot} aria-hidden="true" />
        <p className={styles.message} {...editable(ctx, data, "message", "text", "body", "label", "title")}>
          {message}
        </p>
        {/* No href, no anchor — an unsafe or missing URL drops the link, not the banner. */}
        {href ? (
          <a
            className={styles.link}
            href={href}
            rel={isExternal(href) ? "noopener noreferrer" : undefined}
            {...editable(ctx, data, "linkText", "linkLabel", "ctaLabel", "linkTitle")}
          >
            {linkText ?? "Learn more"}
            <span className={styles.chevron} aria-hidden="true">
              &rarr;
            </span>
          </a>
        ) : null}
      </div>
    </aside>
  );
}
