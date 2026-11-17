import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickHtml, pickString } from "@/lib/fields";

import styles from "./SectionHeadingBlock.module.css";

type Alignment = "left" | "center" | "right";

/**
 * Normalises whatever the instance stored for alignment ("Center", "centre",
 * "text-center", "middle", …) down to the three layouts this block supports.
 * Anything unrecognised falls back to "left".
 */
function resolveAlignment(value: string | undefined): Alignment {
  const normalised = (value ?? "").trim().toLowerCase();
  if (normalised.includes("center") || normalised.includes("centre") || normalised.includes("middle")) {
    return "center";
  }
  if (normalised.includes("right") || normalised.includes("end")) {
    return "right";
  }
  return "left";
}

const alignmentClass: Record<Alignment, string | undefined> = {
  left: styles.alignLeft,
  center: styles.alignCenter,
  right: styles.alignRight,
};

/**
 * Pure-presentation section header: eyebrow, heading and rich-text description.
 * No links, no state — renders on the server.
 */
export default function SectionHeadingBlock({ data, ctx }: BlockComponentProps) {
  const eyebrow = pickString(data, "eyebrow", "kicker", "overline", "label", "preHeading");
  const heading = pickString(data, "heading", "title", "headline", "header", "name");
  const subheadingHtml = pickHtml(
    data,
    "subheading",
    "subHeading",
    "description",
    "body",
    "text",
    "intro",
    "summary",
  );
  const subheadingText = subheadingHtml
    ? undefined
    : pickString(data, "subheading", "subHeading", "description", "body", "text", "intro", "summary");

  if (!eyebrow && !heading && !subheadingHtml && !subheadingText) return null;

  const align = resolveAlignment(pickString(data, "alignment", "align"));

  return (
    <section className={`${styles.block} ${alignmentClass[align]}`}>
      <div className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {heading ? (
          <h2 className={styles.heading} {...editable(ctx, data, "heading", "title", "headline", "header", "name")}>
            {heading}
          </h2>
        ) : null}
        {subheadingHtml ? (
          // Sanitised by pickHtml -> sanitizeHtml (allowlisted tags/attributes/URI schemes).
          <div
            className={styles.subheading}
            {...editable(ctx, data, "subheading", "subHeading", "description", "body", "text", "intro", "summary")}
            dangerouslySetInnerHTML={{ __html: subheadingHtml }}
          />
        ) : subheadingText ? (
          <p
            className={styles.subheading}
            {...editable(ctx, data, "subheading", "subHeading", "description", "body", "text", "intro", "summary")}
          >
            {subheadingText}
          </p>
        ) : null}
      </div>
    </section>
  );
}
