import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickLink, pickString } from "@/lib/fields";
import styles from "./ProductCardBlock.module.css";

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** The CMS stores `icon` as a short keyword ("business"). Render an initial as the emblem. */
function emblem(keyword: string): string {
  const first = Array.from(keyword.trim())[0];
  return first ? first.toUpperCase() : "";
}

export default function ProductCardBlock({ data, nodeKey, ctx }: BlockComponentProps) {
  const title = pickString(data, "title", "name", "heading", "displayName");
  // Authored as a plain sentence in this instance — rendered as text, not HTML.
  const description = pickString(data, "description", "summary", "text", "intro");
  const icon = pickString(data, "icon", "iconName", "iconKey");
  const linkText = pickString(data, "linkText", "linkLabel", "ctaText");
  const link = pickLink(data, "linkUrl", "link", "url", "cta");
  const label = linkText ?? link?.label;

  if (!title && !description && !link) {
    return null;
  }

  const titleId = `product-card-title-${nodeKey}`;
  const external = link ? isExternal(link.href) : false;
  const iconGlyph = icon ? emblem(icon) : "";
  // The stretched overlay would swallow clicks on the per-field edit targets,
  // so the full-card hit area is published-view only.
  const stretch = !ctx?.isEditMode;

  return (
    <article className={styles.card} aria-labelledby={title ? titleId : undefined}>
      <div className={styles.body}>
        {icon && iconGlyph ? (
          <span className={styles.icon} {...editable(ctx, data, "icon", "iconName", "iconKey")}>
            <span aria-hidden="true">{iconGlyph}</span>
            <span className={styles.srOnly}>{icon}</span>
          </span>
        ) : null}

        {title ? (
          <h3
            className={styles.title}
            id={titleId}
            {...editable(ctx, data, "title", "name", "heading", "displayName")}
          >
            {title}
          </h3>
        ) : null}

        {description ? (
          <p
            className={styles.description}
            {...editable(ctx, data, "description", "summary", "text", "intro")}
          >
            {description}
          </p>
        ) : null}

        {link ? (
          <a
            className={`${styles.cta}${stretch ? ` ${styles.stretched}` : ""}`}
            href={link.href}
            {...(external ? { rel: "noopener noreferrer" } : {})}
            {...editable(ctx, data, "linkText", "linkLabel", "ctaText")}
          >
            <span className={styles.ctaLabel}>
              {label ?? "Learn more"}
              {title && !label ? <span className={styles.srOnly}> — {title}</span> : null}
            </span>
            <span className={styles.arrow} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" focusable="false">
                <path
                  d="M2.75 8h10.5M9 3.75 13.25 8 9 12.25"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </a>
        ) : null}
      </div>
    </article>
  );
}
