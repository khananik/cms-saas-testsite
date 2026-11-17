import type { BlockData, ChromeItem, RenderContext } from "@/lib/types";
import { editable } from "@/lib/edit";
import { pickLink, pickList, pickString } from "@/lib/fields";

import styles from "./SiteFooter.module.css";

export type SiteFooterProps = {
  /** The `Footer` chrome item, already `_json`-flattened. Null when unauthored. */
  footer: ChromeItem | null | undefined;
  /** `SiteSettings`, used for the wordmark so header and footer agree. */
  settings?: ChromeItem | null | undefined;
  ctx?: RenderContext | null;
};

type FooterLink = { href: string; label: string };

type FooterColumn = {
  heading: string | undefined;
  links: FooterLink[];
};

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * One authored link. pickLink applies the href allowlist, so an item with a
 * missing or unsafe URL yields undefined here and is dropped rather than
 * rendered as a dead or dangerous anchor.
 */
function toLink(item: BlockData): FooterLink | undefined {
  const node = pickLink(item, "link", "url", "href", "linkUrl", "target", "page");
  const href = node?.href;
  if (href === undefined) return undefined;

  const label =
    pickString(item, "label", "text", "title", "name", "displayName", "linkText") ??
    node?.label ??
    href;

  return { href, label };
}

/**
 * The `columns` array is empty on this instance, so everything here is written
 * defensively: unknown item shapes, missing headings and link lists that contain
 * junk all degrade to "render less", never to a throw.
 */
function toColumns(data: ChromeItem | null | undefined): FooterColumn[] {
  return pickList(data, "columns", "footerColumns", "linkGroups", "groups", "sections")
    .map((column): FooterColumn => {
      const links = pickList(column, "links", "items", "navigationItems", "children", "nodes")
        .map(toLink)
        .filter((link): link is FooterLink => link !== undefined);
      return { heading: pickString(column, "heading", "title", "label", "name"), links };
    })
    .filter((column) => column.heading !== undefined || column.links.length > 0);
}

/**
 * Site footer: dark fir surface, lfgreen accents, wordmark and tagline from the
 * CMS, link columns when the CMS has any.
 *
 * With no columns authored — the current state of this instance — it does NOT
 * degrade to a lone orphaned line: the wordmark and tagline become the deliberate
 * centrepiece of a full-width fir panel, with a hairline rule and the legal row
 * beneath.
 */
export default function SiteFooter({ footer: data, settings, ctx }: SiteFooterProps) {
  const tagline = pickString(data, "tagline", "description", "summary", "text", "body");
  const wordmark =
    pickString(settings, "siteName", "wordmark", "brandName", "title", "name", "displayName") ??
    pickString(data, "siteName", "wordmark", "brandName") ??
    "Mosey Bank";
  const columns = toColumns(data);

  // Derived per render, never at module scope: a module-level Date would be
  // frozen at build time by static rendering and go stale on 1 January.
  const year = new Date().getFullYear();

  const hasColumns = columns.length > 0;

  return (
    <footer className={styles.footer} data-layout={hasColumns ? "columns" : "mark"}>
      <div className={styles.inner}>
        <div className={styles.lockup}>
          <p className={styles.wordmark}>
            {wordmark}
            <span className={styles.pip} aria-hidden="true" />
          </p>
          {tagline ? (
            <p
              className={styles.tagline}
              {...editable(ctx, data, "tagline", "description", "summary", "text", "body")}
            >
              {tagline}
            </p>
          ) : null}
        </div>

        {hasColumns ? (
          <nav className={styles.columns} aria-label="Footer">
            {columns.map((column, columnIndex) => (
              <div className={styles.column} key={`${column.heading ?? "column"}-${columnIndex}`}>
                {column.heading ? <h2 className={styles.columnHeading}>{column.heading}</h2> : null}
                {column.links.length > 0 ? (
                  <ul className={styles.list}>
                    {column.links.map((link, linkIndex) => (
                      <li key={`${link.href}-${linkIndex}`}>
                        <a
                          className={styles.link}
                          href={link.href}
                          rel={isExternal(link.href) ? "noopener noreferrer" : undefined}
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </nav>
        ) : null}
      </div>

      <div className={styles.legal}>
        <div className={styles.legalInner}>
          <p className={styles.copyright}>
            &copy; {year} {wordmark}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
