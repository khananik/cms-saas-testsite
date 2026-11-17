import type { BlockComponentProps } from "@/components/registry";
import { pickHtml, pickImage, pickLink, pickString } from "@/lib/fields";

import styles from "./HeroBlock.module.css";

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Full-width hero: large type over an optional background image with a
 * readable overlay, plus up to two calls to action. Stacks to one column
 * under 720px and stays gutter-safe at 360px.
 */
export default function HeroBlock({ data }: BlockComponentProps) {
  const eyebrow = pickString(data, "eyebrow", "kicker", "label", "overline");
  const heading = pickString(data, "heading", "title", "headline", "name");
  const subheading = pickString(data, "subheading", "subtitle", "preamble", "intro", "lead");
  const body = pickHtml(data, "body", "text", "description", "content", "mainBody", "richText");
  const image = pickImage(data, "image", "backgroundImage", "heroImage", "media", "banner");
  const primary = pickLink(data, "cta", "primaryCta", "link", "callToAction", "primaryLink");
  const secondary = pickLink(data, "secondaryCta", "secondaryLink", "cta2", "altCta");

  const hasText = Boolean(eyebrow || heading || subheading || body);
  const hasCta = Boolean(primary || secondary);
  if (!hasText && !hasCta) return null;

  const primaryLabel = primary?.label ?? "Learn more";
  const secondaryLabel = secondary?.label ?? "Read more";

  return (
    <section className={styles.hero} data-has-image={image ? "true" : "false"}>
      {image ? (
        <div className={styles.media} aria-hidden="true">
          <img
            className={styles.image}
            src={image.src}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
          <span className={styles.overlay} />
        </div>
      ) : null}

      <div className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {heading ? <h1 className={styles.heading}>{heading}</h1> : null}
        {subheading ? <p className={styles.subheading}>{subheading}</p> : null}
        {body ? (
          <div className={styles.body} dangerouslySetInnerHTML={{ __html: body }} />
        ) : null}

        {hasCta ? (
          <div className={styles.actions}>
            {primary ? (
              <a
                className={`${styles.cta} ${styles.ctaPrimary}`}
                href={primary.href}
                rel={isExternal(primary.href) ? "noopener noreferrer" : undefined}
              >
                {primaryLabel}
              </a>
            ) : null}
            {secondary ? (
              <a
                className={`${styles.cta} ${styles.ctaSecondary}`}
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
