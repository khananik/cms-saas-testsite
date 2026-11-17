"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { BlockComponentProps } from "@/components/registry";
import type { BlockData } from "@/lib/types";
import { pickHtml, pickImage, pickList, pickString } from "@/lib/fields";

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

export default function CustomerVoicesBlock({ data, nodeKey }: BlockComponentProps) {
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
  const [activeIndex, setActiveIndex] = useState(0);

  const syncActiveIndex = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const centre = viewport.scrollLeft + viewport.clientWidth / 2;
    let nearest = 0;
    let smallest = Number.POSITIVE_INFINITY;
    itemRefs.current.forEach((element, index) => {
      if (element === null) return;
      const itemCentre = element.offsetLeft + element.clientWidth / 2;
      const distance = Math.abs(itemCentre - centre);
      if (distance < smallest) {
        smallest = distance;
        nearest = index;
      }
    });
    setActiveIndex(nearest);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null || !isSlider) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncActiveIndex);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    syncActiveIndex();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [isSlider, syncActiveIndex, voices.length]);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), voices.length - 1);
      const target = itemRefs.current[clamped];
      const viewport = viewportRef.current;
      if (target === null || target === undefined || viewport === null) return;
      // Decided at call time: a CSS `scroll-behavior` override cannot suppress a
      // programmatic smooth scroll, so prefers-reduced-motion has to be read here.
      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      viewport.scrollTo({
        left: target.offsetLeft,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      setActiveIndex(clamped);
    },
    [voices.length],
  );

  const onViewportKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLUListElement>) => {
      if (!isSlider) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(activeIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(activeIndex - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(voices.length - 1);
      }
    },
    [activeIndex, goTo, isSlider, voices.length],
  );

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
              <h2 className={styles.heading} id={headingId}>
                {heading}
              </h2>
            )}
            {intro !== undefined && <p className={styles.intro}>{intro}</p>}
          </header>
        )}

        <div className={styles.viewportWrap}>
          <ul
            ref={viewportRef}
            className={isSlider ? styles.track : styles.grid}
            aria-live="polite"
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
            <button
              type="button"
              className={styles.arrow}
              onClick={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Previous customer quote"
            >
              <span aria-hidden="true">&#8592;</span>
            </button>

            <div className={styles.dots} role="group" aria-label="Choose a customer quote">
              {voices.map((voice, index) => (
                <button
                  key={voice.key}
                  type="button"
                  className={styles.dot}
                  onClick={() => goTo(index)}
                  aria-current={index === activeIndex ? "true" : undefined}
                  aria-label={`Quote ${index + 1} of ${voices.length}`}
                />
              ))}
            </div>

            <button
              type="button"
              className={styles.arrow}
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === voices.length - 1}
              aria-label="Next customer quote"
            >
              <span aria-hidden="true">&#8594;</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
