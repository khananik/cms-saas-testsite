/**
 * Shared Optimizely Graph / Visual Builder types for testsiteanik.
 * Every other module imports from here; nothing is re-declared elsewhere.
 */

export type ContentMetadata = {
  key: string;
  version?: string | null;
  locale?: string | null;
  displayName?: string | null;
  types?: string[] | null;
  url?: {
    default?: string | null;
    hierarchical?: string | null;
  } | null;
  published?: string | null;
};

/**
 * A block's raw Graph payload. Property casing varies per CMS instance, so this
 * is intentionally an index signature of `unknown` — read it through lib/fields.ts.
 */
export type BlockData = {
  _metadata?: ContentMetadata | null;
  [field: string]: unknown;
};

export type DisplaySetting = {
  key: string;
  value: string;
};

export type CompositionStructureNode = {
  __typename?: string;
  key: string;
  nodeType?: string | null;
  displayName?: string | null;
  displayTemplateKey?: string | null;
  displaySettings?: DisplaySetting[] | null;
  nodes?: CompositionNode[] | null;
};

export type CompositionComponentNode = {
  __typename?: string;
  key: string;
  nodeType?: string | null;
  displayTemplateKey?: string | null;
  displaySettings?: DisplaySetting[] | null;
  component?: BlockData | null;
};

export type CompositionNode = CompositionStructureNode | CompositionComponentNode;

export type ExperiencePage = {
  _metadata?: ContentMetadata | null;
  composition?: CompositionStructureNode | null;
  [field: string]: unknown;
};

export type RenderContext = {
  isEditMode: boolean;
  locale?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A component node carries a `component` payload, or self-identifies via
 * nodeType/__typename. Graph omits `nodeType` on some instances, so both are checked.
 */
export function isComponentNode(node: CompositionNode | null | undefined): node is CompositionComponentNode {
  if (!isRecord(node)) return false;
  const nodeType = typeof node.nodeType === "string" ? node.nodeType.toLowerCase() : undefined;
  if (nodeType === "component") return true;
  if (nodeType === "structure") return false;
  const typename = typeof node.__typename === "string" ? node.__typename.toLowerCase() : undefined;
  if (typename === "compositioncomponentnode") return true;
  if (typename === "compositionstructurenode") return false;
  return isRecord((node as CompositionComponentNode).component);
}

/**
 * A structure node holds child nodes (sections -> rows -> columns).
 */
export function isStructureNode(node: CompositionNode | null | undefined): node is CompositionStructureNode {
  if (!isRecord(node)) return false;
  return !isComponentNode(node);
}
