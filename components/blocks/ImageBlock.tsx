import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickImage, pickString } from "@/lib/fields";
import styles from "./ImageBlock.module.css";

/**
 * ImageBlock — a standalone image with an optional caption.
 *
 * Authored fields on the live instance: `image` (a media reference that already
 * carries url.default), plus optional `altText`, `caption` and `rendition`.
 *
 * `rendition` is a CMS-side size hint (e.g. a named crop). Applying it would need
 * an image loader that can rewrite the asset URL, which this front end does not
 * have, so the field is deliberately ignored and the full asset is rendered with
 * a capped height instead.
 *
 * Alt text: the authored `altText` wins, then whatever pickImage recovered from
 * the asset itself, then "". An empty alt marks the image decorative, which is
 * correct and far better than inventing a description.
 */
export default function ImageBlock({ data, ctx }: BlockComponentProps) {
  const image = pickImage(data, "image", "media", "picture");
  const altText = pickString(data, "altText", "alt", "imageAlt");
  const caption = pickString(data, "caption", "description", "text");

  // No usable src means no <img> — never emit a broken image.
  if (image === undefined) return null;

  const alt = altText ?? image.alt ?? "";

  return (
    <figure className={styles.block}>
      <img
        className={styles.image}
        src={image.src}
        alt={alt}
        loading="lazy"
        decoding="async"
        {...editable(ctx, data, "image", "media", "picture")}
      />
      {caption ? (
        <figcaption
          className={styles.caption}
          {...editable(ctx, data, "caption", "description", "text")}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
