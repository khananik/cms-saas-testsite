import type { BlockComponentProps } from "@/components/registry";
import type { BlockData } from "@/lib/types";
import {
  pickHtml,
  pickImage,
  pickLink,
  pickList,
  pickString,
} from "@/lib/fields";
import styles from "./FeaturedContentBlock.module.css";

type MediaSide = "left" | "right";

function readMediaSide(data: BlockData | null | undefined): MediaSide {
  const raw = pickString(
    data,
    "mediaPosition",
    "imagePosition",
    "layout",
  );
  if (!raw) return "left";
  const value = raw.toLowerCase();
  if (value.includes("right") || value.includes("reverse")) return "right";
  return "left";
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

type FeatureRowProps = {
  data: BlockData;
  side: MediaSide;
  headingLevel: 2 | 3;
  rowKey: string;
};

function FeatureRow({ data, side, headingLevel, rowKey }: FeatureRowProps) {
  const eyebrow = pickString(data, "eyebrow", "kicker", "label", "overline");
  const heading = pickString(data, "heading", "title", "headline", "name");
  const body = pickHtml(
    data,
    "body",
    "bodyText",
    "description",
    "text",
    "content",
    "summary",
  );
  const image = pickImage(data, "image", "media", "picture", "thumbnail", "photo");
  // The alt text is often authored as a sibling field rather than on the image node.
  const imageAlt = pickString(data, "imageAlt", "altText", "alt", "imageAlternateText");
  const link = pickLink(data, "link", "cta", "callToAction", "url", "button");

  if (!eyebrow && !heading && !body && !image && !link) return null;

  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = heading ? `${rowKey}-heading` : undefined;

  return (
    <article
      className={`${styles.row} ${side === "right" ? styles.mediaRight : styles.mediaLeft}`}
      aria-labelledby={headingId}
    >
      {image ? (
        <div className={styles.media}>
          <img
            className={styles.image}
            src={image.src}
            alt={image.alt ?? imageAlt ?? ""}
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}

      <div className={styles.text}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {heading ? (
          <Heading id={headingId} className={styles.heading}>
            {heading}
          </Heading>
        ) : null}
        {body ? (
          <div
            className={styles.body}
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : null}
        {link ? (
          <a
            className={styles.link}
            href={link.href}
            {...(isExternal(link.href)
              ? { rel: "noopener noreferrer" }
              : {})}
          >
            {link.label ?? "Read more"}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function FeaturedContentBlock({
  data,
  nodeKey,
}: BlockComponentProps) {
  const items = pickList(data, "items", "features", "cards");
  const baseSide = readMediaSide(data);

  if (items.length > 0) {
    const sectionEyebrow = pickString(
      data,
      "eyebrow",
      "kicker",
      "label",
      "overline",
    );
    const sectionHeading = pickString(data, "heading", "title", "headline");
    const sectionBody = pickHtml(
      data,
      "body",
      "bodyText",
      "description",
      "text",
      "content",
    );

    const rows = items.map((item, index) => {
      const itemSide = readMediaSide(item);
      const explicit = pickString(
        item,
        "mediaPosition",
        "imagePosition",
        "layout",
      );
      const alternated: MediaSide =
        index % 2 === 0
          ? baseSide
          : baseSide === "left"
            ? "right"
            : "left";
      return (
        <FeatureRow
          key={`${nodeKey}-item-${index}`}
          rowKey={`${nodeKey}-item-${index}`}
          data={item}
          side={explicit ? itemSide : alternated}
          headingLevel={3}
        />
      );
    });

    if (!sectionHeading && !sectionEyebrow && !sectionBody) {
      return (
        <section className={styles.block} aria-label="Featured content">
          <div className={styles.inner}>
            <div className={styles.rows}>{rows}</div>
          </div>
        </section>
      );
    }

    const sectionHeadingId = sectionHeading ? `${nodeKey}-heading` : undefined;

    return (
      <section className={styles.block} aria-labelledby={sectionHeadingId}>
        <div className={styles.inner}>
          <header className={styles.intro}>
            {sectionEyebrow ? (
              <p className={styles.eyebrow}>{sectionEyebrow}</p>
            ) : null}
            {sectionHeading ? (
              <h2 id={sectionHeadingId} className={styles.sectionHeading}>
                {sectionHeading}
              </h2>
            ) : null}
            {sectionBody ? (
              <div
                className={styles.body}
                dangerouslySetInnerHTML={{ __html: sectionBody }}
              />
            ) : null}
          </header>
          <div className={styles.rows}>{rows}</div>
        </div>
      </section>
    );
  }

  const single = (
    <FeatureRow
      data={data}
      side={baseSide}
      headingLevel={2}
      rowKey={nodeKey}
    />
  );

  const hasContent =
    pickString(data, "eyebrow", "kicker", "label", "overline") !== undefined ||
    pickString(data, "heading", "title", "headline", "name") !== undefined ||
    pickHtml(data, "body", "bodyText", "description", "text", "content", "summary") !==
      undefined ||
    pickImage(data, "image", "media", "picture", "thumbnail", "photo") !==
      undefined ||
    pickLink(data, "link", "cta", "callToAction", "url", "button") !== undefined;

  if (!hasContent) return null;

  return (
    <section className={styles.block} aria-label="Featured content">
      <div className={styles.inner}>
        <div className={styles.rows}>{single}</div>
      </div>
    </section>
  );
}
