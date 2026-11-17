import type { ReactNode } from "react";
import type { CompositionStructureNode, DisplaySetting, RenderContext } from "@/lib/types";
import { displayAttributes } from "@/lib/display";
import styles from "./layout.module.css";

export type LayoutNodeProps = {
  node: CompositionStructureNode;
  ctx: RenderContext;
  children?: ReactNode;
};

/**
 * Display settings come straight from the CMS: possibly missing, null, or of an
 * unexpected shape. This read is defensive and never throws.
 */
function readSetting(node: CompositionStructureNode | null | undefined, pattern: RegExp): string | undefined {
  const settings: unknown = node?.displaySettings;
  if (!Array.isArray(settings)) return undefined;
  for (const entry of settings as DisplaySetting[]) {
    if (!entry || typeof entry !== "object") continue;
    const key = typeof entry.key === "string" ? entry.key : "";
    if (!key || !pattern.test(key)) continue;
    const value: unknown = entry.value;
    if (typeof value === "string" && value.trim().length > 0) return value.trim().toLowerCase();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export { readSetting };

/**
 * A composition section: a full-bleed band plus the centred content column.
 * Only the "full width" variant is special-cased; anything unexpected falls
 * back to the default container, so an unknown setting cannot break the page.
 */
export default function BlankSection({ node, children }: LayoutNodeProps) {
  if (!children) return null;

  const width = readSetting(node, /width|size|container/i) ?? "";
  const isFull = width === "full" || width === "fullwidth" || width === "wide";

  return (
    <section
      className={`ob-section ${styles.section}`}
      {...displayAttributes(node)}
      aria-label={node?.displayName ?? undefined}
    >
      <div className={isFull ? styles.containerFull : styles.container}>{children}</div>
    </section>
  );
}
