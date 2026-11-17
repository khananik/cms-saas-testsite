import type { BlockComponentProps } from "@/components/registry";
import { pickImage, pickLink, pickString } from "@/lib/fields";

import styles from "./HeroBlock.module.css";

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Full-width hero: large type over an optional background image with a
 * readable overlay, plus a single call to action. Stacks to one column
 * under 720px and stays gutter-safe at 360px.
 *
 * Field names below match the authored CMS schema (headline, subheadline,
 * ctaText, ctaLink, backgroundImage); the later names in each list are
 * tolerated spellings from other instances of the type.
 */
export default function HeroBlock({ data }: BlockComponentProps) {
  const heading = pickString(data, "headline", "heading", "title", "name");
  const subheading = pickString(data, "subheadline", "subheading", "subtitle", "preamble", "intro");

  // backgroundImage is authored as a content reference ({ key }), which carries no
  // URL. pickImage returns undefined for that shape, and the allowlist in lib/url.ts
  // drops anything that is not a safe relative path or http(s) URL, so the hero
  // simply renders without a background rather than emitting a broken <img>.
  const image = pickImage(data, "backgroundImage", "image", "heroImage", "media", "banner");

  // pickLink runs the href through the same allowlist; never render an <a> without it.
  const cta = pickLink(data, "ctaLink", "cta", "primaryCta", "link", "callToAction");
  const ctaLabel = pickString(data, "ctaText", "ctaLabel", "linkText") ?? cta?.label ?? "Learn more";

  const hasText = Boolean(heading || subheading);
  if (!hasText && !cta) return null;

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
        {heading ? <h1 className={styles.heading}>{heading}</h1> : null}
        {subheading ? <p className={styles.subheading}>{subheading}</p> : null}

        {cta ? (
          <div className={styles.actions}>
            <a
              className={`${styles.cta} ${styles.ctaPrimary}`}
              href={cta.href}
              rel={isExternal(cta.href) ? "noopener noreferrer" : undefined}
            >
              {ctaLabel}
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
