"use client";

import { useCallback, useId, useState } from "react";

import type { BlockComponentProps } from "@/components/registry";
import { pickHtml, pickString } from "@/lib/fields";

import styles from "./FaqItem.module.css";

export type FaqItemProps = BlockComponentProps & {
  /** Controlled open state. When omitted the item manages its own state. */
  open?: boolean;
  /** Supplied by FaqContainerBlock when it owns the open state. */
  onToggle?: () => void;
  /** Heading level of the question row inside a list of items. */
  headingLevel?: 2 | 3 | 4;
};

/** nodeKey comes from Graph, so reduce it to characters that are safe in an id. */
function toIdPart(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-{2,}/g, "-");
  return cleaned.length > 0 ? cleaned : "item";
}

export default function FaqItem({
  data,
  nodeKey,
  open,
  onToggle,
  headingLevel = 3,
}: FaqItemProps) {
  const [selfOpen, setSelfOpen] = useState(false);
  const reactId = useId();

  const question = pickString(data, "question", "title", "heading", "headline", "label", "name");
  const answerHtml = pickHtml(data, "answer", "body", "text", "content", "description", "richText");
  const answerText = answerHtml === undefined
    ? pickString(data, "answer", "body", "text", "content", "description")
    : undefined;

  const isControlled = onToggle !== undefined;
  const isOpen = isControlled ? open === true : selfOpen;

  const handleToggle = useCallback(() => {
    if (onToggle !== undefined) {
      onToggle();
      return;
    }
    setSelfOpen((previous) => !previous);
  }, [onToggle]);

  if (question === undefined && answerHtml === undefined && answerText === undefined) {
    return null;
  }

  const base = `faq-${toIdPart(nodeKey)}-${toIdPart(reactId)}`;
  const buttonId = `${base}-button`;
  const panelId = `${base}-panel`;
  const Heading: "h2" | "h3" | "h4" = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";

  return (
    <article className={styles.item} data-open={isOpen ? "true" : "false"}>
      <Heading className={styles.heading}>
        <button
          type="button"
          id={buttonId}
          className={styles.trigger}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={handleToggle}
        >
          <span className={styles.question}>{question ?? "Read more"}</span>
          <span className={styles.chevron} aria-hidden="true" />
        </button>
      </Heading>

      <div className={styles.panelOuter} inert={!isOpen}>
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className={styles.panelInner}
        >
          <div className={styles.answer}>
            {answerHtml !== undefined ? (
              // Sanitised server-side by pickHtml -> sanitizeHtml (allowlisted tags/attrs).
              <div dangerouslySetInnerHTML={{ __html: answerHtml }} />
            ) : (
              <p>{answerText}</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
