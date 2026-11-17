import type { BlockComponentProps } from "@/components/registry";
import { pickHtml, pickLink, pickString } from "@/lib/fields";

import styles from "./CallToAction.module.css";

type Variant = "accent" | "muted" | "outline";

const VARIANTS: readonly Variant[] = ["accent", "muted", "outline"];

/** Maps whatever the instance stores ("Accent", "muted ", "OUTLINE") onto a known variant. */
function toVariant(value: string | undefined): Variant {
  if (value === undefined) return "accent";
  const normalised = value.trim().toLowerCase();
  const match = VARIANTS.find((variant) => variant === normalised);
  return match ?? "accent";
}

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Banner call to action: heading, optional rich-text body and up to two links,
 * on one of three surfaces. Content is centred, the buttons wrap on narrow
 * screens and every tap target clears 44px.
 */
export default function CallToAction({ data }: BlockComponentProps) {
  const heading = pickString(data, "heading", "title", "headline", "name");
  // pickHtml returns sanitised markup — the only value allowed near dangerouslySetInnerHTML.
  const body = pickHtml(data, "body", "text", "description", "content", "mainBody", "richText");
  const primary = pickLink(data, "primaryCta", "cta", "link", "callToAction", "primaryLink", "button");
  const secondary = pickLink(data, "secondaryCta", "secondaryLink", "cta2", "altCta", "secondaryButton");
  const variant = toVariant(pickString(data, "variant", "style"));

  if (!heading && !body && !primary && !secondary) return null;

  const primaryLabel = primary?.label ?? "Get started";
  const secondaryLabel = secondary?.label ?? "Learn more";

  return (
    <section className={styles.cta} data-variant={variant}>
      <div className={styles.inner}>
        {heading ? <h2 className={styles.heading}>{heading}</h2> : null}
        {body ? <div className={styles.body} dangerouslySetInnerHTML={{ __html: body }} /> : null}

        {primary || secondary ? (
          <div className={styles.actions}>
            {primary ? (
              <a
                className={`${styles.button} ${styles.buttonPrimary}`}
                href={primary.href}
                rel={isExternal(primary.href) ? "noopener noreferrer" : undefined}
              >
                {primaryLabel}
              </a>
            ) : null}
            {secondary ? (
              <a
                className={`${styles.button} ${styles.buttonSecondary}`}
                href={secondary.href}
                rel={isExternal(secondary.href) ? "noopener noreferrer" : undefined}
              >
                {secondaryLabel}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
