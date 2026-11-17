import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickHtml, pickLink, pickString } from "@/lib/fields";

import styles from "./CallToAction.module.css";

type Variant = "accent" | "muted" | "outline";

const VARIANTS: readonly Variant[] = ["accent", "muted", "outline"];

/** Maps whatever the instance stores ("Accent", "muted ", "OUTLINE") onto a known variant. */
function toVariant(value: string | undefined): Variant {
  if (value === undefined) return "accent";
  const normalised = value.trim().toLowerCase();
  const match = VARIANTS.find((variant) => variant === normalised);
  return match ?? "accent";
}

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Call to action: a single prominent button built from the authored `label` and
 * `link`. Heading and body are optional extras that only render when an instance
 * happens to carry them. Content is centred and the button clears 44px.
 */
export default function CallToAction({ data, ctx }: BlockComponentProps) {
  // `label` and `link` are the real authored fields on this type; the rest are
  // tolerated fallbacks for instances that name things differently.
  const label = pickString(data, "label", "linkText", "ctaLabel", "buttonText", "linkLabel");
  const link = pickLink(data, "link", "cta", "callToAction", "url", "buttonLink", "primaryCta");

  // Optional extras — absent from every sample seen on this instance.
  const heading = pickString(data, "heading", "title", "headline", "name");
  // pickHtml returns sanitised markup — the only value allowed near dangerouslySetInnerHTML.
  const body = pickHtml(data, "body", "text", "description", "content", "mainBody", "richText");
  const variant = toVariant(pickString(data, "variant", "style"));

  if (!link && !heading && !body) return null;

  // Prefer the authored label, then any label pickLink found inside the link node.
  const buttonLabel = label ?? link?.label ?? "Learn more";

  return (
    <section className={styles.cta} data-variant={variant}>
      <div className={styles.inner}>
        {heading ? (
          <h2 className={styles.heading} {...editable(ctx, data, "heading", "title", "headline", "name")}>
            {heading}
          </h2>
        ) : null}
        {body ? (
          <div
            className={styles.body}
            {...editable(ctx, data, "body", "text", "description", "content", "mainBody", "richText")}
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : null}

        {/* Never render an <a> without an href: pickLink returns undefined for an unsafe or missing URL. */}
        {link ? (
          <div className={styles.actions}>
            <a
              className={styles.button}
              href={link.href}
              rel={isExternal(link.href) ? "noopener noreferrer" : undefined}
              {...editable(ctx, data, "label", "linkText", "ctaLabel", "buttonText", "linkLabel")}
            >
              {buttonLabel}
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
