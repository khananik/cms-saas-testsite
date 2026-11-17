import { createElement } from "react";

import type { BlockComponentProps } from "@/components/registry";
// Circular import: registry.ts imports this file, and this file imports
// registry.ts. That is safe ONLY because `resolveBlock` is called at render
// time (inside the component body), never at module top level — by the time
// any component renders, both modules have finished evaluating. Do not hoist a
// resolveBlock(...) call or a registry lookup to module scope.
import { resolveBlock } from "@/components/registry";
import { pickList, pickString } from "@/lib/fields";
import type { BlockData } from "@/lib/types";

import styles from "./VariationContainerBlock.module.css";

/**
 * Nesting cap. A variation may itself hold a VariationContainerBlock; anything
 * deeper than this renders nothing, so malformed or self-referencing content
 * cannot recurse without bound.
 */
const MAX_VARIATION_DEPTH = 3;

const DEFAULT_VARIATION_KEY = "control";

type VariationContainerProps = BlockComponentProps & {
  /** Variation nesting level; 0 for a container placed directly in the composition. */
  depth?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Nested blocks should arrive flattened, but flatten a stray `_json` defensively. */
function flatten(block: BlockData): BlockData {
  const json = (block as Record<string, unknown>)._json;
  if (!isRecord(json)) return block;
  const rest: Record<string, unknown> = { ...block };
  delete rest._json;
  return { ...json, ...rest } as BlockData;
}

function typesOf(block: BlockData): string[] | null {
  const meta = (block as Record<string, unknown>)._metadata;
  if (!isRecord(meta) || !Array.isArray(meta.types)) return null;
  return meta.types.filter((t): t is string => typeof t === "string");
}

/**
 * Blocks that draw no side gutter of their own (they rely on a section/node
 * wrapper for it). A variation's blocks have no such wrapper, so the container
 * supplies one for these types only; self-padded blocks (CTA, text, image,
 * testimonial) keep their own edges and stay aligned with the rest of the page.
 */
const GUTTERLESS_TYPES = new Set(["sectionheadingblock"]);

function needsGutter(types: string[] | null): boolean {
  return Array.isArray(types) && types.some((t) => GUTTERLESS_TYPES.has(t.toLowerCase()));
}

/** Keeps generated React keys to a stable, safe character set. */
function keyPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

/**
 * Renders an A/B test container (e.g. flagKey "savings_offer").
 *
 * Without an experimentation SDK deciding the bucket, the standard fallback is
 * to render the "control" variation, else the first one. Real per-visitor
 * bucketing needs the Optimizely Feature Experimentation SDK: call
 * `decide(flagKey)` for the visitor and render the variation whose
 * `variationKey` matches the decision's variation key.
 */
export default function VariationContainerBlock({ data, nodeKey, ctx, depth = 0 }: VariationContainerProps) {
  if (depth >= MAX_VARIATION_DEPTH) return null;

  const flagKey = pickString(data, "flagKey", "flag", "key");
  const variations = pickList(data, "variations");
  const chosen =
    variations.find((v) => pickString(v, "variationKey", "key") === DEFAULT_VARIATION_KEY) ?? variations[0];
  if (!chosen) return null;

  const variationKey = pickString(chosen, "variationKey", "key") ?? "default";
  const blocks = pickList(chosen, "blocks", "items", "content");
  if (blocks.length === 0) return null;

  const baseKey = `${nodeKey}-${keyPart(variationKey)}`;

  const rendered = blocks.map((raw, index) => {
    const block = flatten(raw);
    const types = typesOf(block);
    const Component = resolveBlock(types);
    // Unknown block types render nothing, as everywhere else on the page.
    if (!Component) return null;

    const meta = (block as Record<string, unknown>)._metadata;
    const ownKey = isRecord(meta) && typeof meta.key === "string" ? keyPart(meta.key) : String(index);
    const childKey = `${baseKey}-${ownKey}-${index}`;

    // A nested container is rendered directly so the depth counter travels with it.
    const child =
      Component === VariationContainerBlock ? (
        <VariationContainerBlock data={block} nodeKey={childKey} ctx={ctx} depth={depth + 1} />
      ) : (
        createElement(Component, { data: block, nodeKey: childKey, ctx })
      );
    return (
      <div key={childKey} className={needsGutter(types) ? `${styles.item} ${styles.gutter}` : styles.item}>
        {child}
      </div>
    );
  });

  return (
    <div
      className={styles.variation}
      data-flag-key={flagKey}
      data-variation-key={variationKey}
    >
      {rendered}
    </div>
  );
}
