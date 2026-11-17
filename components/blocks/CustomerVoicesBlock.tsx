"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { BlockComponentProps } from "@/components/registry";
import type { BlockData } from "@/lib/types";
import { pickHtml, pickImage, pickList, pickString } from "@/lib/fields";
import { editable } from "@/lib/edit";

import styles from "./CustomerVoicesBlock.module.css";

type Voice = {
  key: string;
  quoteText?: string;
  quoteHtml?: string;
  name?: string;
  title?: string;
  company?: string;
  image?: { src: string; alt?: string };
};

/** Never notifies: the snapshot only has to differ between server and client. */
function subscribeNever(): () => void {
  return () => {};
}

const GRID_MAX = 3;

type SliderMetrics = {
  /** Distance between the left edges of two neighbouring slides (slide + gap). */
  step: number;
  maxScroll: number;
  /** Reachable snap positions, not slides: 3 visible of 6 gives 4. */
  pageCount: number;
  perView: number;
  page: number;
  atStart: boolean;
  atEnd: boolean;
};

const INITIAL_METRICS: SliderMetrics = {
  step: 0,
  maxScroll: 0,
  pageCount: 1,
  perView: 1,
  page: 0,
  atStart: true,
  atEnd: false,
};

const QUOTE_NAMES = ["text", "quote", "body", "testimonial", "statement", "content", "description"] as const;

/** Cheap markup probe: this instance stores the quote as a plain sentence, but other
 *  instances may author the same field as RichText. Plain text stays plain text. */
const LOOKS_LIKE_MARKUP = /<[a-z][^>]*>/i;

function toVoice(item: BlockData, index: number): Voice | undefined {
  // `text` on this instance is a plain sentence, so it is read as a string and
  // rendered as text. Only a value that actually carries markup goes through
  // pickHtml (which sanitises) and dangerouslySetInnerHTML.
  const quoteValue = pickString(item, ...QUOTE_NAMES);
  const quoteHtml =
    quoteValue !== undefined && LOOKS_LIKE_MARKUP.test(quoteValue)
      ? pickHtml(item, ...QUOTE_NAMES)
      : undefined;
  const quoteText = quoteHtml === undefined ? quoteValue : undefined;
  const name = pickString(item, "author", "name", "authorName", "customerName", "personName", "displayName");
  const title = pickString(item, "role", "title", "jobTitle", "position", "authorTitle");
  const company = pickString(item, "company", "organisation", "organization", "customer", "companyName", "brand");
  const image = pickImage(item, "image", "photo", "avatar", "portrait", "authorImage", "picture");

  if (
    quoteText === undefined &&
    quoteHtml === undefined &&
    name === undefined &&
    company === undefined
  ) {
    return undefined;
  }

  const metadataKey = item._metadata?.key;
  const key = typeof metadataKey === "string" && metadataKey.length > 0 ? metadataKey : `voice-${index}`;

  return { key, quoteText, quoteHtml, name, title, company, image };
}

export default function CustomerVoicesBlock({ data, nodeKey, ctx }: BlockComponentProps) {
  const heading = pickString(data, "heading", "title", "headline", "sectionHeading");
  const intro = pickString(data, "subheading", "intro", "subtitle", "description", "lead");

  const voices = useMemo<Voice[]>(() => {
    const items = pickList(data, "cards", "voices", "testimonials", "items", "quotes");
    const mapped: Voice[] = [];
    items.forEach((item, index) => {
      const voice = toVoice(item, index);
      if (voice !== undefined) mapped.push(voice);
    });
    return mapped;
  }, [data]);

  const isSlider = voices.length > GRID_MAX;

  const viewportRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  // false during SSR and the first client render, true afterwards. useSyncExternalStore
  // is the supported way to read "are we hydrated" without a setState inside an effect.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [metrics, setMetrics] = useState<SliderMetrics>(INITIAL_METRICS);

  /** Reads the track geometry: one "page" is one slide plus the gap, and the number
   *  of reachable snap positions follows from how far the track can actually scroll. */
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const first = itemRefs.current[0];
    const second = itemRefs.current[1];
    if (viewport === null || first === null || first === undefined) return;
    const step =
      second !== null && second !== undefined
        ? second.offsetLeft - first.offsetLeft
        : first.offsetWidth;
    if (step <= 0) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const pageCount = Math.max(1, Math.ceil(maxScroll / step - 0.05) + 1);
    const gap = Math.max(0, step - first.offsetWidth);
    const perView = Math.max(1, Math.floor((viewport.clientWidth + gap) / step + 0.05));
    const left = viewport.scrollLeft;
    const atEnd = left >= maxScroll - 2;
    const page = atEnd ? pageCount - 1 : Math.min(pageCount - 1, Math.round(left / step));
    setMetrics((prev) =>
      prev.step === step &&
      prev.maxScroll === maxScroll &&
      prev.pageCount === pageCount &&
      prev.perView === perView &&
      prev.page === page &&
      prev.atStart === left <= 2 &&
      prev.atEnd === atEnd
        ? prev
        : { step, maxScroll, pageCount, perView, page, atStart: left <= 2, atEnd },
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null || !isSlider) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    viewport.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : undefined;
    observer?.observe(viewport);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [isSlider, measure, voices.length]);

  const goToPage = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (viewport === null) return;
      const clamped = Math.min(Math.max(index, 0), metrics.pageCount - 1);
      // Decided at call time: a CSS `scroll-behavior` override cannot suppress a
      // programmatic smooth scroll, so prefers-reduced-motion has to be read here.
      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      viewport.scrollTo({
        left: Math.min(clamped * metrics.step, metrics.maxScroll),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [metrics.maxScroll, metrics.pageCount, metrics.step],
  );

  const onViewportKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLUListElement>) => {
      if (!isSlider) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPage(metrics.page + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPage(metrics.page - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goToPage(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToPage(metrics.pageCount - 1);
      }
    },
    [goToPage, isSlider, metrics.page, metrics.pageCount],
  );

  const pageLabel = (index: number): string => {
    const first = index + 1;
    const last = Math.min(voices.length, index + metrics.perView);
    return first === last
      ? `Show quote ${first} of ${voices.length}`
      : `Show quotes ${first} to ${last} of ${voices.length}`;
  };

  if (voices.length === 0) return null;

  const showControls = hydrated && isSlider;
  const headingId = `customer-voices-${nodeKey}-heading`;

  return (
    <section
      className={styles.block}
      aria-labelledby={heading === undefined ? undefined : headingId}
      aria-label={heading === undefined ? "Customer voices" : undefined}
    >
      <div className={styles.inner}>
        {(heading !== undefined || intro !== undefined) && (
          <header className={styles.header}>
            {heading !== undefined && (
              <h2
                className={styles.heading}
                id={headingId}
                {...editable(ctx, data, "heading", "title", "headline", "sectionHeading")}
              >
                {heading}
              </h2>
            )}
            {intro !== undefined && (
              <p
                className={styles.intro}
                {...editable(ctx, data, "subheading", "intro", "subtitle", "description", "lead")}
              >
                {intro}
              </p>
            )}
          </header>
        )}

        <div className={styles.viewportWrap}>
          <ul
            ref={viewportRef}
            className={isSlider ? `${styles.track}${showControls ? ` ${styles.enhanced}` : ""}` : styles.grid}
            aria-live="polite"
            aria-label={isSlider ? "Customer quotes" : undefined}
            tabIndex={isSlider ? 0 : undefined}
            onKeyDown={onViewportKeyDown}
          >
            {voices.map((voice, index) => (
              <li
                key={voice.key}
                className={styles.item}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
              >
                <figure className={styles.card}>
                  {(voice.quoteHtml !== undefined || voice.quoteText !== undefined) && (
                    <span className={styles.mark} aria-hidden="true">
                      &ldquo;
                    </span>
                  )}

                  {voice.quoteHtml !== undefined ? (
                    <blockquote
                      className={styles.quote}
                      dangerouslySetInnerHTML={{ __html: voice.quoteHtml }}
                    />
                  ) : voice.quoteText !== undefined ? (
                    <blockquote className={styles.quote}>
                      <p>{voice.quoteText}</p>
                    </blockquote>
                  ) : null}

                  {(voice.name !== undefined ||
                    voice.title !== undefined ||
                    voice.company !== undefined ||
                    voice.image !== undefined) && (
                    <figcaption className={styles.person}>
                      {voice.image !== undefined && (
                        <img
                          className={styles.avatar}
                          src={voice.image.src}
                          alt={voice.image.alt ?? ""}
                          loading="lazy"
                          decoding="async"
                          width={56}
                          height={56}
                        />
                      )}
                      <span className={styles.personText}>
                        {voice.name !== undefined && <span className={styles.name}>{voice.name}</span>}
                        {(voice.title !== undefined || voice.company !== undefined) && (
                          <span className={styles.role}>
                            {[voice.title, voice.company].filter((part) => part !== undefined).join(", ")}
                          </span>
                        )}
                      </span>
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        </div>

        {showControls && (
          <div className={styles.controls}>
            <div className={styles.dots} role="group" aria-label="Choose customer quotes">
              {Array.from({ length: metrics.pageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={styles.dot}
                  onClick={() => goToPage(index)}
                  aria-current={index === metrics.page ? "true" : undefined}
                  aria-label={pageLabel(index)}
                />
              ))}
            </div>

            <div className={styles.arrows}>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => goToPage(metrics.page - 1)}
                disabled={metrics.atStart}
                aria-label="Previous customer quote"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => goToPage(metrics.page + 1)}
                disabled={metrics.atEnd}
                aria-label="Next customer quote"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
