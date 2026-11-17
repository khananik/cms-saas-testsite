import type { BlockComponentProps } from "@/components/registry";
import type { BlockData } from "@/lib/types";
import {
  pickImage,
  pickLink,
  pickList,
  pickString,
} from "@/lib/fields";
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

function toLogoEntry(item: BlockData, index: number): LogoEntry | undefined {
  const image = pickImage(item, "logo", "image", "icon", "src", "file", "media");
  if (!image || !image.src) {
    return undefined;
  }

  const name: string | undefined = pickString(
    item,
    "name",
    "companyName",
    "company",
    "title",
    "heading",
    "label",
    "altText",
    "alt",
  );

  const link = pickLink(item, "link", "url", "href", "target", "cta");

  return {
    key: item._metadata?.key ?? `logo-${index}`,
    src: image.src,
    alt: image.alt ?? name ?? "",
    href: link?.href,
    isExternal: link?.href ? isExternalHref(link.href) : false,
  };
}

export default function LogoGridBlock({ data, nodeKey }: BlockComponentProps) {
  const heading = pickString(data, "heading", "title", "headline", "name");
  const subheading = pickString(data, "subheading", "subtitle", "description", "intro");

  const logos = pickList(data, "logos", "items", "images")
    .map(toLogoEntry)
    .filter((entry): entry is LogoEntry => entry !== undefined);

  if (logos.length === 0) {
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
          <div className={styles.header}>
            {heading && (
              <h2 id={headingId} className={styles.heading}>
                {heading}
              </h2>
            )}
            {subheading && <p className={styles.subheading}>{subheading}</p>}
          </div>
        )}

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
      </div>
    </section>
  );
}
