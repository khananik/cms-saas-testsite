import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickImage, pickNumber, pickString } from "@/lib/fields";
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

export default function TestimonialBlock({ data, ctx }: BlockComponentProps) {
  // Authored fields on this type: quote, authorName, authorRole, authorImage.
  // `quote` is plain text in the CMS, so it is rendered as text — no HTML here.
  const quote = pickString(
    data,
    "quote",
    "quoteText",
    "testimonial",
    "testimonialText",
    "text",
    "body",
  );

  const authorName = pickString(
    data,
    "authorName",
    "name",
    "author",
    "personName",
    "customerName",
  );
  const authorRole = pickString(
    data,
    "authorRole",
    "role",
    "jobTitle",
    "authorTitle",
    "title",
    "position",
  );

  // authorImage is a content reference ({ key }) on this type: pickImage returns
  // undefined unless the instance actually resolves it to a URL, and an <img> is
  // only emitted when a usable src came back.
  const avatar = pickImage(
    data,
    "authorImage",
    "avatar",
    "image",
    "photo",
    "portrait",
  );

  // Optional extras: not part of this content type today, kept only so an
  // instance that does author them still renders. Absent => nothing rendered.
  const company = pickString(
    data,
    "company",
    "companyName",
    "organization",
    "organisation",
  );
  const rating = normaliseRating(
    pickNumber(data, "rating", "stars", "score", "starRating"),
  );

  if (!quote && !authorName && !company) return null;

  const attribution = [authorRole, company].filter(Boolean).join(", ");
  const hasAttribution =
    Boolean(authorName) || Boolean(attribution) || Boolean(avatar);

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

        {quote ? (
          <blockquote className={styles.quote}>
            <p
              {...editable(
                ctx,
                data,
                "quote",
                "quoteText",
                "testimonial",
                "testimonialText",
                "text",
                "body",
              )}
            >
              {quote}
            </p>
          </blockquote>
        ) : null}

        {hasAttribution ? (
          <figcaption className={styles.caption}>
            {avatar ? (
              <img
                {...editable(
                  ctx,
                  data,
                  "authorImage",
                  "avatar",
                  "image",
                  "photo",
                  "portrait",
                )}
                className={styles.avatar}
                src={avatar.src}
                alt={avatar.alt ?? ""}
                loading="lazy"
                decoding="async"
                width={56}
                height={56}
              />
            ) : null}
            <span className={styles.captionText}>
              {authorName ? (
                <span
                  className={styles.authorName}
                  {...editable(
                    ctx,
                    data,
                    "authorName",
                    "name",
                    "author",
                    "personName",
                    "customerName",
                  )}
                >
                  {authorName}
                </span>
              ) : null}
              {attribution ? (
                <span
                  className={styles.authorMeta}
                  // `attribution` merges authorRole with the optional `company`
                  // field, so it is only tagged as authorRole when this element
                  // renders that one field and nothing else.
                  {...(company
                    ? {}
                    : editable(
                        ctx,
                        data,
                        "authorRole",
                        "role",
                        "jobTitle",
                        "authorTitle",
                        "title",
                        "position",
                      ))}
                >
                  {attribution}
                </span>
              ) : null}
            </span>
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}
