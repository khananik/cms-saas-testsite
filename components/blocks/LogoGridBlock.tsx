import type { BlockComponentProps } from "@/components/registry";
import type { BlockData } from "@/lib/types";
import { editable } from "@/lib/edit";
import { pickImage, pickLink, pickList, pickString } from "@/lib/fields";
import styles from "./LogoGridBlock.module.css";

type LogoEntry = {
  key: string;
  src: string;
  alt: string;
  href?: string;
  isExternal: boolean;
};

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * A logo entry is a content reference ([_IContent]), so the image may resolve to
 * nothing at all. Without a safe src there is no logo to show: skip the item
 * rather than emit a broken <img>.
 */
function toLogoEntry(item: BlockData, index: number): LogoEntry | undefined {
  const image = pickImage(item, "logo", "image", "icon", "src", "file", "media");
  if (!image || !image.src) {
    return undefined;
  }

  const name: string | undefined =
    pickString(
      item,
      "name",
      "companyName",
      "company",
      "title",
      "heading",
      "label",
      "altText",
      "alt",
    ) ?? (item._metadata?.displayName ?? undefined);

  const link = pickLink(item, "link", "url", "href", "target", "cta");

  return {
    key: item._metadata?.key ?? `logo-${index}`,
    src: image.src,
    alt: image.alt ?? name ?? "",
    href: link?.href,
    isExternal: link?.href ? isExternalHref(link.href) : false,
  };
}

export default function LogoGridBlock({ data, nodeKey, ctx }: BlockComponentProps) {
  // Authored field names confirmed against a live sample: `heading`, `subheading`.
  const heading = pickString(data, "heading", "title", "headline", "name");
  const subheading = pickString(data, "subheading", "subtitle", "description", "intro");

  const logos = pickList(data, "logos", "items", "images")
    .map(toLogoEntry)
    .filter((entry): entry is LogoEntry => entry !== undefined);

  // `logos` is frequently unpopulated on this instance, so heading + subheading
  // are meaningful content on their own. Only an entirely empty block renders nothing.
  if (!heading && !subheading && logos.length === 0) {
    return null;
  }

  const headingId = heading ? `logo-grid-heading-${nodeKey}` : undefined;

  return (
    <section
      className={styles.section}
      aria-labelledby={headingId}
      aria-label={heading ? undefined : "Customer and partner logos"}
    >
      <div className={styles.inner}>
        {(heading || subheading) && (
          <div className={logos.length > 0 ? styles.header : styles.headerOnly}>
            {heading && <span className={styles.flourish} aria-hidden="true" />}
            {heading && (
              <h2
                id={headingId}
                className={styles.heading}
                {...editable(ctx, data, "heading", "title", "headline", "name")}
              >
                {heading}
              </h2>
            )}
            {subheading && (
              <p
                className={styles.subheading}
                {...editable(ctx, data, "subheading", "subtitle", "description", "intro")}
              >
                {subheading}
              </p>
            )}
          </div>
        )}

        {logos.length > 0 && (
          <ul className={styles.grid}>
            {logos.map((logo) => (
              <li key={logo.key} className={styles.item}>
                {logo.href ? (
                  <a
                    className={styles.link}
                    href={logo.href}
                    // A logo image may legitimately have alt="" (decorative), but a link
                    // must never be nameless — fall back to a generic label.
                    aria-label={logo.alt.length > 0 ? undefined : "Visit partner website"}
                    {...(logo.isExternal
                      ? { rel: "noopener noreferrer", target: "_blank" }
                      : {})}
                  >
                    <img
                      className={styles.logo}
                      src={logo.src}
                      alt={logo.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ) : (
                  <img
                    className={styles.logo}
                    src={logo.src}
                    alt={logo.alt}
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
