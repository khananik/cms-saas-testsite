import styles from "./layout.module.css";
import { displayAttributes } from "@/lib/display";
import { readSetting, type LayoutNodeProps } from "./BlankSection";

const JUSTIFY: Record<string, string | undefined> = {
  left: styles.justifyStart,
  start: styles.justifyStart,
  center: styles.justifyCenter,
  centre: styles.justifyCenter,
  middle: styles.justifyCenter,
  right: styles.justifyEnd,
  end: styles.justifyEnd,
};

/**
 * A composition row: a wrapping flex track that collapses to a single column
 * below 860px (see layout.module.css).
 */
export default function Row({ node, children }: LayoutNodeProps) {
  if (!children) return null;

  const justify = JUSTIFY[readSetting(node, /justify|align|position/i) ?? ""];

  const className = justify ? `ob-row ${styles.row} ${justify}` : `ob-row ${styles.row}`;

  return (
    <div className={className} {...displayAttributes(node)}>
      {children}
    </div>
  );
}
