import type { BlockComponentProps } from "@/components/registry";
import {
  pickHtml,
  pickImage,
  pickNumber,
  pickString,
} from "@/lib/fields";
import styles from "./TestimonialBlock.module.css";

const MAX_RATING = 5;

/**
 * Clamp an arbitrary Graph value into a whole 0..5 star rating.
 * Returns undefined when there is nothing sensible to render, so a bad
 * value can never produce a negative/huge loop below.
 */
function normaliseRating(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  return rounded > MAX_RATING ? MAX_RATING : rounded;
}

export default function TestimonialBlock({ data }: BlockComponentProps) {
  // pickHtml returns sanitised markup only; it is the single value ever
  // passed to dangerouslySetInnerHTML in this file.
  const quoteHtml = pickHtml(
    data,
    "quote",
    "quoteText",
    "text",
    "body",
    "testimonial",
    "testimonialText",
    "content",
    "description",
  );
  const quoteText = pickString(
    data,
    "quote",
    "quoteText",
    "text",
    "body",
    "testimonial",
    "testimonialText",
    "content",
    "description",
  );

  const authorName = pickString(
    data,
    "authorName",
    "name",
    "author",
    "personName",
    "customerName",
  );
  const authorTitle = pickString(
    data,
    "authorTitle",
    "role",
    "jobTitle",
    "title",
    "position",
  );
  const company = pickString(
    data,
    "company",
    "companyName",
    "organization",
    "organisation",
    "customer",
  );
  const avatar = pickImage(
    data,
    "avatar",
    "authorImage",
    "image",
    "photo",
    "portrait",
    "picture",
  );
  const rating = normaliseRating(
    pickNumber(data, "rating", "stars", "score", "starRating"),
  );

  const hasQuote = Boolean(quoteHtml) || Boolean(quoteText);
  if (!hasQuote && !authorName && !company) return null;

  const attribution = [authorTitle, company].filter(Boolean).join(", ");
  const hasAttribution = Boolean(authorName) || Boolean(attribution) || Boolean(avatar);

  return (
    <section className={styles.block}>
      <figure className={styles.figure}>
        {rating !== undefined ? (
          <p
            className={styles.rating}
            role="img"
            aria-label={`${rating} out of ${MAX_RATING}`}
          >
            {Array.from({ length: MAX_RATING }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={index < rating ? styles.starOn : styles.starOff}
              >
                {"★"}
              </span>
            ))}
          </p>
        ) : null}

        {hasQuote ? (
          <blockquote className={styles.quote}>
            {quoteHtml ? (
              <div dangerouslySetInnerHTML={{ __html: quoteHtml }} />
            ) : (
              <p>{quoteText}</p>
            )}
          </blockquote>
        ) : null}

        {hasAttribution ? (
          <figcaption className={styles.caption}>
            {avatar ? (
              <img
                className={styles.avatar}
                src={avatar.src}
                alt={avatar.alt ?? (authorName ? `${authorName}` : "")}
                loading="lazy"
                decoding="async"
                width={56}
                height={56}
              />
            ) : null}
            <span className={styles.captionText}>
              {authorName ? (
                <span className={styles.authorName}>{authorName}</span>
              ) : null}
              {attribution ? (
                <span className={styles.authorMeta}>{attribution}</span>
              ) : null}
            </span>
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}
