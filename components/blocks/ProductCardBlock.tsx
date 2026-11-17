import type { BlockComponentProps } from "@/components/registry";
import {
  pickHtml,
  pickImage,
  pickLink,
  pickNumber,
  pickString,
} from "@/lib/fields";
import styles from "./ProductCardBlock.module.css";

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export default function ProductCardBlock({ data, nodeKey }: BlockComponentProps) {
  const title = pickString(
    data,
    "name",
    "productName",
    "title",
    "heading",
    "headline",
    "displayName",
  );
  const description = pickHtml(
    data,
    "description",
    "productDescription",
    "summary",
    "body",
    "text",
    "intro",
  );
  const priceText = pickString(data, "price", "priceText", "productPrice", "cost", "amount");
  const priceNumber =
    priceText === undefined
      ? pickNumber(data, "price", "priceValue", "productPrice", "cost", "amount")
      : undefined;
  const price = priceText ?? (priceNumber !== undefined ? String(priceNumber) : undefined);
  const badge = pickString(data, "badge", "label", "tag", "eyebrow", "category");
  const image = pickImage(data, "image", "productImage", "media", "photo", "thumbnail");
  // The alt text is often authored as a sibling field rather than on the image node.
  const imageAlt = pickString(data, "imageAlt", "altText", "alt", "imageAlternateText");
  const link = pickLink(data, "cta", "callToAction", "link", "url", "productLink", "href");

  if (!title && !description && !price && !image && !link) {
    return null;
  }

  const titleId = `product-card-title-${nodeKey}`;
  const external = link ? isExternal(link.href) : false;

  return (
    <article className={styles.card} aria-labelledby={title ? titleId : undefined}>
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

      <div className={styles.body}>
        {badge ? <span className={styles.badge}>{badge}</span> : null}

        {title ? (
          <h3 className={styles.title} id={titleId}>
            {title}
          </h3>
        ) : null}

        {price ? (
          <p className={styles.price}>
            <span className={styles.srOnly}>Price: </span>
            {price}
          </p>
        ) : null}

        {description ? (
          <div
            className={styles.description}
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : null}

        {link ? (
          <a
            className={styles.cta}
            href={link.href}
            {...(external ? { rel: "noopener noreferrer" } : {})}
          >
            {link.label ?? "View product"}
            {title ? <span className={styles.srOnly}> — {title}</span> : null}
          </a>
        ) : null}
      </div>
    </article>
  );
}
