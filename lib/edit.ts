import { matchedFieldName } from "./fields";
import type { BlockData, RenderContext } from "./types";

/**
 * On-page editing support for the CMS preview iframe.
 *
 * The Optimizely edit view looks for `data-epi-edit="<propertyName>"` on a rendered
 * element and makes that single field editable in place — so an editor can click a
 * headline and type, instead of selecting the whole block and using the side panel.
 * `data-epi-block-id` (added by ExperienceRenderer) selects the block; this selects
 * one field within it.
 *
 * Two rules matter:
 *  - The attribute is only emitted in edit context. Published markup stays clean, and
 *    the attribute never reaches a page a visitor sees.
 *  - The value must be the property name THIS instance uses. Components ask for
 *    several candidate names, so the real matched name is resolved here rather than
 *    assuming the first candidate.
 */

/** CMS property names are identifiers; anything else is not emitted as an attribute. */
const PROPERTY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;

export type EditAttribute = { "data-epi-edit"?: string };

/**
 * Spread onto the element that renders the field:
 *
 *   <h1 {...editable(ctx, data, "headline", "heading", "title")}>{heading}</h1>
 *
 * Returns an empty object outside edit mode, or when the instance carries none of
 * the candidate names, so the spread is always safe.
 */
export function editable(
  ctx: RenderContext | null | undefined,
  data: BlockData | null | undefined,
  ...names: string[]
): EditAttribute {
  if (!ctx?.isEditMode) return {};
  const field = matchedFieldName(data, ...names);
  if (field === undefined || !PROPERTY_NAME_PATTERN.test(field)) return {};
  return { "data-epi-edit": field };
}
