"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { BlockComponentProps } from "@/components/registry";
import { editable } from "@/lib/edit";
import { pickList, pickNumber, pickString } from "@/lib/fields";
import type { BlockData } from "@/lib/types";

import styles from "./StatsCounterBlock.module.css";

const ANIMATION_DURATION_MS = 1400;
const VISIBILITY_THRESHOLD = 0.25;

type Stat = {
  id: string;
  /** Numeric target, when the value could be parsed as a number. */
  target?: number;
  /** Decimal places to keep while counting up, derived from the source value. */
  decimals: number;
  /** Fallback text shown verbatim when the value is not numeric. */
  text?: string;
  prefix?: string;
  suffix?: string;
  label?: string;
  /** True when the fields came from the block itself rather than a nested list item. */
  self: boolean;
};

type ParsedValue = {
  value: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
};

function decimalsOf(numericText: string): number {
  const dot = numericText.indexOf(".");
  return dot === -1 ? 0 : numericText.length - dot - 1;
}

/** Parses "1,200", "$1.2k", "50" etc. into a number plus any baked-in affixes. */
function parseNumericText(raw: string): ParsedValue | undefined {
  const match = /^([^0-9]*?)([+-]?[0-9][0-9,  \s]*(?:\.[0-9]+)?)(.*)$/.exec(raw.trim());
  if (!match) return undefined;

  const [, rawPrefix, rawNumber, rawSuffix] = match;
  if (rawNumber === undefined) return undefined;

  const cleaned = rawNumber.replace(/[,  \s]/g, "");
  if (!/^[+-]?[0-9]+(\.[0-9]+)?$/.test(cleaned)) return undefined;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return undefined;

  const prefix = (rawPrefix ?? "").trim();
  const suffix = (rawSuffix ?? "").trim();

  return {
    value,
    decimals: decimalsOf(cleaned),
    prefix: prefix.length > 0 ? prefix : undefined,
    suffix: suffix.length > 0 ? suffix : undefined,
  };
}

/**
 * The authored `value` is a string ("50") in this instance, so the string is the
 * source of truth and is parsed FIRST. pickNumber is only consulted when there is
 * no string at all: it strips non-numeric characters, so a purely textual value
 * such as "Many" would come back as 0 rather than undefined.
 */
function parseValue(raw: string | undefined, num: number | undefined): ParsedValue | undefined {
  if (typeof raw === "string") return parseNumericText(raw);
  if (typeof num === "number" && Number.isFinite(num)) {
    return { value: num, decimals: decimalsOf(String(num)) };
  }
  return undefined;
}

function formatNumber(value: number, decimals: number, locale: string | undefined): string {
  try {
    return new Intl.NumberFormat(locale || "en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Builds one stat. `scope` is "self" when `item` is the block itself — the real
 * shape in this instance — in which case the label candidates stay narrow so a
 * sibling heading/intro field can never be mistaken for the stat label.
 */
function toStat(item: BlockData, index: number, nodeKey: string, scope: "self" | "item"): Stat | undefined {
  const rawValue = pickString(item, "value", "number", "stat", "statistic", "count", "amount", "figure");
  const numericValue = pickNumber(item, "value", "number", "stat", "statistic", "count", "amount", "figure");
  const label =
    scope === "self"
      ? pickString(item, "label", "statLabel", "caption", "name")
      : pickString(item, "label", "caption", "title", "heading", "name", "text", "description");
  const parsed = parseValue(rawValue, numericValue);

  if (!parsed && !rawValue && !label) return undefined;

  const prefix = pickString(item, "prefix", "valuePrefix", "symbol") ?? parsed?.prefix;
  const suffix = pickString(item, "suffix", "valueSuffix", "unit", "unitOfMeasure") ?? parsed?.suffix;

  return {
    id: `${nodeKey}-stat-${index}`,
    target: parsed?.value,
    decimals: parsed?.decimals ?? 0,
    text: parsed ? undefined : rawValue,
    prefix,
    suffix,
    label,
    self: scope === "self",
  };
}

export default function StatsCounterBlock({ data, nodeKey, ctx }: BlockComponentProps) {
  const heading = pickString(data, "heading", "title", "headline", "header");
  const intro = pickString(data, "intro", "subheading", "description", "summary", "text");

  const stats = useMemo<Stat[]>(() => {
    // Primary path: this type is ONE stat (value / suffix / label). The list path
    // below is kept only as a tolerant fallback for instances that group stats.
    const items = pickList(data, "stats", "items", "counters", "statistics", "facts");
    const fromList = items
      .map((item, index) => toStat(item, index, nodeKey, "item"))
      .filter((stat): stat is Stat => stat !== undefined);
    if (fromList.length > 0) return fromList;

    const single = toStat(data, 0, nodeKey, "self");
    return single ? [single] : [];
  }, [data, nodeKey]);

  const sectionRef = useRef<HTMLElement | null>(null);
  // 1 = fully counted up. Server render and first client render both use 1 so
  // hydration matches, and viewers without JS/IO/animation keep the real value.
  const [progress, setProgress] = useState(1);

  const shouldAnimate = stats.some((stat) => typeof stat.target === "number" && stat.target !== 0);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !shouldAnimate) return;
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    const reduceMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : undefined;
    if (!reduceMotion || reduceMotion.matches) return;

    let frame = 0;
    let startedAt: number | null = null;

    const step = (timestamp: number) => {
      if (startedAt === null) startedAt = timestamp;
      const elapsed = Math.min(1, (timestamp - startedAt) / ANIMATION_DURATION_MS);
      setProgress(easeOutCubic(elapsed));
      if (elapsed < 1) {
        frame = window.requestAnimationFrame(step);
      } else {
        frame = 0;
      }
    };

    // The first callback reports the stat's position at hydration. A stat that is
    // already on screen keeps its real, server-rendered value (no flash to 0); only
    // one still off-screen is reset to 0 and counts up when it scrolls into view.
    let armed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (!armed) {
          if (entry.isIntersecting) {
            observer.disconnect();
            return;
          }
          armed = true;
          setProgress(0);
          return;
        }
        if (!entry.isIntersecting || entry.intersectionRatio < VISIBILITY_THRESHOLD) return;
        observer.disconnect();
        startedAt = null;
        frame = window.requestAnimationFrame(step);
      },
      { threshold: [0, VISIBILITY_THRESHOLD] },
    );

    // Printing an off-screen, not-yet-counted stat must still show the real value.
    const showFinal = () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
      frame = 0;
      setProgress(1);
    };
    window.addEventListener("beforeprint", showFinal);

    observer.observe(node);

    return () => {
      window.removeEventListener("beforeprint", showFinal);
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [shouldAnimate]);

  if (!heading && stats.length === 0) return null;

  const headingId = `${nodeKey}-stats-heading`;
  const locale = ctx.locale;
  // Solo = the real shape: a bare stat the CMS drops into a row beside siblings,
  // so it carries no section padding and flexes to share the row.
  const solo = !heading && !intro && stats.length === 1;

  return (
    <section
      ref={sectionRef}
      className={solo ? `${styles.block} ${styles.solo}` : styles.block}
      aria-labelledby={heading ? headingId : undefined}
    >
      <div className={styles.inner}>
        {heading ? (
          <h2 id={headingId} className={styles.heading}>
            {heading}
          </h2>
        ) : null}
        {intro ? <p className={styles.intro}>{intro}</p> : null}

        {stats.length > 0 ? (
          <dl className={styles.grid}>
            {stats.map((stat) => {
              const finalText =
                typeof stat.target === "number"
                  ? formatNumber(stat.target, stat.decimals, locale)
                  : (stat.text ?? "");
              const animatedText =
                typeof stat.target === "number"
                  ? formatNumber(stat.target * progress, stat.decimals, locale)
                  : finalText;
              const full = `${stat.prefix ?? ""}${finalText}${stat.suffix ?? ""}`;

              return (
                <div key={stat.id} className={styles.item}>
                  <dt
                    className={stat.label ? styles.label : styles.srOnly}
                    {...(stat.self && stat.label
                      ? editable(ctx, data, "label", "statLabel", "caption", "name")
                      : {})}
                  >
                    {stat.label ?? full}
                  </dt>
                  <dd className={styles.value}>
                    <span className={styles.valueRow} aria-hidden="true">
                      {stat.prefix ? <span className={styles.affix}>{stat.prefix}</span> : null}
                      <span
                        className={styles.number}
                        {...(stat.self
                          ? editable(
                              ctx,
                              data,
                              "value",
                              "number",
                              "stat",
                              "statistic",
                              "count",
                              "amount",
                              "figure",
                            )
                          : {})}
                      >
                        {animatedText}
                      </span>
                      {stat.suffix ? (
                        <span
                          className={styles.affix}
                          {...(stat.self
                            ? editable(ctx, data, "suffix", "valueSuffix", "unit", "unitOfMeasure")
                            : {})}
                        >
                          {stat.suffix}
                        </span>
                      ) : null}
                    </span>
                    {/* Final value, never animated, for assistive technology. */}
                    <span className={styles.srOnly}>{full}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
