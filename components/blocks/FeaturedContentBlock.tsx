import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import {
  pickHtml,
  pickImage,
  pickLink,
  pickString,
} from "@/lib/fields";
import styles from "./FeaturedContentBlock.module.css";

/**
 * FeaturedContentBlock.
 *
 * The only authored field on this type in the live instance is `featuredPage`,
 * a ContentReference. Every sampled instance of the block is empty, and a
 * reference cannot be expanded into its page (title, teaser, hero image)
 * without a second Graph lookup — that belongs in lib/queries.ts, not here.
 *
 * So this component reads `featuredPage` for whatever the reference itself
 * serialises (its url, and a display name when Graph includes one) and renders
 * the optional editorial fields alongside it. With nothing authored it renders
 * nothing at all rather than an empty shell.
 *
 * Design: with an image the block is a media/text split whose sides alternate
 * down the page; the side is derived from `nodeKey` so it is stable between
 * server and client render and does not depend on sibling order. Without an
 * image there is nothing to split, so the text becomes a tinted editorial
 * callout instead of a half-empty two-column grid.
 */

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Stable per-instance parity for the alternating layout. A hash of the node key
 * rather than a render counter: deterministic on the server and on hydration.
 */
function flipsSides(key: string): boolean {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 2 === 1;
}

export default function FeaturedContentBlock({
  data,
  nodeKey,
  ctx,
}: BlockComponentProps) {
  // The real field. A ContentReference serialises like the other reference
  // fields on this instance ({ key, url: { default, hierarchical, ... } }),
  // so pickLink can usually get a href out of it even unresolved.
  const featuredLink = pickLink(data, "featuredPage");
  const featuredName = pickString(data, "featuredPage");

  const eyebrow = pickString(data, "eyebrow", "kicker", "label", "overline");
  const heading = pickString(data, "heading", "headline", "title", "name");

  // Rich text on this instance is authored as { html, json }; `subheading` /
  // `description` are plain sentences, so they are rendered as text.
  const bodyHtml = pickHtml(data, "body", "bodyText", "mainBody", "content");
  const bodyText = pickString(
    data,
    "subheading",
    "subheadline",
    "description",
    "summary",
    "teaser",
    "text",
  );

  const image = pickImage(data, "image", "media", "picture", "thumbnail", "photo");
  // Alt text is sometimes authored as a sibling field rather than on the asset.
  const imageAlt = pickString(data, "imageAlt", "altText", "alt", "imageAlternateText");

  // An explicit CTA wins; otherwise fall back to the reference's own url.
  const link =
    pickLink(data, "link", "linkUrl", "cta", "callToAction", "url", "button") ??
    featuredLink;
  const linkLabel =
    pickString(data, "linkText", "linkLabel", "ctaText", "buttonText") ??
    link?.label ??
    featuredName;

  const hasContent =
    eyebrow !== undefined ||
    heading !== undefined ||
    bodyHtml !== undefined ||
    bodyText !== undefined ||
    image !== undefined ||
    link !== undefined;

  if (!hasContent) return null;

  const headingId = heading ? `${nodeKey}-heading` : undefined;

  return (
    <section
      className={styles.block}
      data-layout={image ? "split" : "callout"}
      {...(headingId
        ? { "aria-labelledby": headingId }
        : { "aria-label": "Featured content" })}
    >
      <div className={styles.inner}>
        <article
          className={styles.row}
          data-flip={image && flipsSides(nodeKey) ? "true" : "false"}
        >
          {image ? (
            <div className={styles.frame}>
              {/* Offset brand shape behind the picture — decoration only. */}
              <span className={styles.flourish} aria-hidden="true" />
              <div className={styles.media}>
                <img
                  className={styles.image}
                  {...editable(ctx, data, "image", "media", "picture", "thumbnail", "photo")}
                  src={image.src}
                  alt={image.alt ?? imageAlt ?? ""}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          ) : null}

          <div className={styles.text}>
            {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
            {heading ? (
              <h2
                id={headingId}
                className={styles.heading}
                {...editable(ctx, data, "heading", "headline", "title", "name")}
              >
                {heading}
              </h2>
            ) : null}
            {bodyHtml ? (
              <div
                className={styles.body}
                {...editable(ctx, data, "body", "bodyText", "mainBody", "content")}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : bodyText ? (
              <p
                className={styles.body}
                {...editable(
                  ctx,
                  data,
                  "subheading",
                  "subheadline",
                  "description",
                  "summary",
                  "teaser",
                  "text",
                )}
              >
                {bodyText}
              </p>
            ) : null}
            {link ? (
              <a
                className={styles.link}
                {...editable(ctx, data, "linkText", "linkLabel", "ctaText", "buttonText")}
                href={link.href}
                {...(isExternal(link.href)
                  ? { rel: "noopener noreferrer" }
                  : {})}
              >
                {linkLabel ?? "Read more"}
                <span className={styles.arrow} aria-hidden="true">
                  &#8594;
                </span>
              </a>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
