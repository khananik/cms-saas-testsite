"use client";

import { useCallback, useId, useMemo, useState } from "react";

import type { BlockComponentProps } from "@/components/registry";
import { pickHtml, pickList, pickString } from "@/lib/fields";
import type { BlockData } from "@/lib/types";

import FaqItemBlock from "./FaqItemBlock";
import styles from "./FaqContainerBlock.module.css";

const QUESTION_FIELDS = ["question", "heading", "title", "label", "name", "displayName"] as const;
const ANSWER_FIELDS = ["answer", "body", "text", "content", "description", "answerText"] as const;

/**
 * Collapses markup and entities down to plain text. Used ONLY for the JSON-LD
 * payload and for the accordion button label, never for rendering markup:
 * the visible answer goes through FaqItemBlock, which sanitises via pickHtml.
 */
function toPlainText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : undefined;
}

/** Keeps generated DOM ids to a safe, stable character set. */
function slug(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-");
  return cleaned.length > 0 ? cleaned : "faq";
}

function isTruthyFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "true" || normalised === "yes" || normalised === "1" || normalised === "multiple";
}

type Entry = {
  readonly data: BlockData;
  readonly key: string;
  readonly question: string;
  readonly answer: string | undefined;
};

/**
 * Accordion container. State (which indices are open) lives here; each answer
 * body is rendered by the FaqItemBlock component so a single FAQ entry looks the
 * same whether it is nested here or placed on its own in the composition.
 */
export default function FaqContainerBlock({ data, nodeKey, ctx }: BlockComponentProps) {
  const heading = pickString(data, "heading", "title", "headline", "header", "name");
  const descriptionHtml = pickHtml(data, "description", "intro", "body", "text", "summary", "subheading");
  const allowMultiple = isTruthyFlag(
    pickString(data, "allowMultiple", "allowMultipleOpen", "multiple", "expandMultiple"),
  );

  const items = pickList(data, "items", "faqs", "questions", "faqItems");

  const entries = useMemo<Entry[]>(() => {
    const result: Entry[] = [];
    items.forEach((item, index) => {
      const question = toPlainText(pickString(item, ...QUESTION_FIELDS));
      const answer =
        toPlainText(pickString(item, ...ANSWER_FIELDS)) ??
        toPlainText(pickHtml(item, ...ANSWER_FIELDS));
      if (question === undefined && answer === undefined) return;
      const metadataKey = typeof item?._metadata?.key === "string" ? item._metadata.key : undefined;
      result.push({
        data: item,
        key: metadataKey ?? String(index),
        question: question ?? `Question ${index + 1}`,
        answer,
      });
    });
    return result;
  }, [items]);

  const [openIndices, setOpenIndices] = useState<ReadonlySet<number>>(() => new Set<number>());

  const toggle = useCallback(
    (index: number) => {
      setOpenIndices((previous) => {
        const next = new Set<number>(allowMultiple ? previous : []);
        if (previous.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    },
    [allowMultiple],
  );

  const reactId = useId();
  const idBase = `${slug(nodeKey)}-${slug(reactId)}`;
  const headingId = `${idBase}-heading`;

  // Built from plain-text values only and serialised with JSON.stringify; the
  // "<" escape prevents any value from closing the script element early.
  const jsonLd = useMemo(() => {
    const questions = entries.flatMap((entry) => {
      const answer = entry.answer;
      if (answer === undefined) return [];
      return [
        {
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        },
      ];
    });
    if (questions.length === 0) return undefined;
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions,
    }).replace(/</g, "\\u003c");
  }, [entries]);

  if (entries.length === 0 && !heading && !descriptionHtml) return null;

  return (
    <section className={styles.block} aria-labelledby={heading ? headingId : undefined}>
      <div className={styles.inner}>
        {heading ? (
          <h2 className={styles.heading} id={headingId}>
            {heading}
          </h2>
        ) : null}

        {descriptionHtml ? (
          <div
            className={styles.description}
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        ) : null}

        {entries.length > 0 ? (
          <ul className={styles.list}>
            {entries.map((entry, index) => {
              const isOpen = openIndices.has(index);
              return (
                <li className={styles.item} key={entry.key}>
                  {/* FaqItemBlock owns the trigger, the panel and all the ARIA wiring;
                      the container only owns which indices are open. Re-adding a
                      button or panel here would double every question. */}
                  <FaqItemBlock
                    data={entry.data}
                    nodeKey={entry.key}
                    ctx={ctx}
                    open={isOpen}
                    onToggle={() => toggle(index)}
                    headingLevel={3}
                  />
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      ) : null}
    </section>
  );
}
