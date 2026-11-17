import styles from "./layout.module.css";
import { displayAttributes } from "@/lib/display";
import { readSetting, type LayoutNodeProps } from "./BlankSection";

/**
 * Named and numeric width tokens seen across Visual Builder display templates,
 * mapped to a percentage of the row. Anything not listed falls through to the
 * default: equal distribution via flex: 1 1 0.
 */
const WIDTHS: Record<string, string> = {
  "1": "8.3333%",
  "2": "16.6667%",
  "3": "25%",
  "4": "33.3333%",
  "5": "41.6667%",
  "6": "50%",
  "7": "58.3333%",
  "8": "66.6667%",
  "9": "75%",
  "10": "83.3333%",
  "11": "91.6667%",
  "12": "100%",
  full: "100%",
  whole: "100%",
  half: "50%",
  onehalf: "50%",
  "1/2": "50%",
  third: "33.3333%",
  onethird: "33.3333%",
  "1/3": "33.3333%",
  twothirds: "66.6667%",
  twothird: "66.6667%",
  "2/3": "66.6667%",
  quarter: "25%",
  onequarter: "25%",
  onefourth: "25%",
  "1/4": "25%",
  threequarters: "75%",
  threequarter: "75%",
  "3/4": "75%",
};

/**
 * A composition column. Its basis comes from a width/size/span display setting
 * when one is recognised; otherwise all columns in a row share the space
 * equally. No colour is ever set inline.
 */
export default function Column({ node, children }: LayoutNodeProps) {
  if (!children) return null;

  const raw = readSetting(node, /width|size|span|columns?/i);
  const token = raw ? raw.replace(/[\s_-]/g, "").replace(/(col|cols|columns|span)/g, "") : "";
  const basis = WIDTHS[token];

  return (
    <div
      className={`ob-column ${styles.column}`}
      {...displayAttributes(node)}
      style={basis ? { flexBasis: basis, maxWidth: basis } : undefined}
    >
      {children}
    </div>
  );
}
