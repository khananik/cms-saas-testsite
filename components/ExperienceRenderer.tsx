import { createElement } from "react";
import type {
  CompositionComponentNode,
  CompositionNode,
  CompositionStructureNode,
  RenderContext,
} from "@/lib/types";
import { isComponentNode, isStructureNode } from "@/lib/types";
import { resolveBlock } from "@/components/registry";
import BlankSection from "@/components/layout/BlankSection";
import Row from "@/components/layout/Row";
import Column from "@/components/layout/Column";
import UnknownBlock from "@/components/blocks/UnknownBlock";

/**
 * Composition data arrives from an external system (Optimizely Graph) and is not
 * trusted to be well-formed: a cyclic or absurdly deep tree would otherwise
 * recurse until the stack blows. Rendering stops once this depth is reached.
 */
const MAX_DEPTH = 12;

type StructureKind = "section" | "row" | "column" | "unknown";

/**
 * Dispatch table for structure nodes. `nodeType` is authoritative; when Graph
 * omits it we fall back to `displayTemplateKey`, which commonly carries the
 * same word (e.g. "DefaultRow", "TwoColumnSection").
 */
function classifyStructure(node: CompositionStructureNode): StructureKind {
  // nodeType is the authoritative field. Match it exactly first, so a SECTION whose
  // display template merely mentions columns (e.g. "ThreeColumnSection") is not rendered
  // as a Column. Only fall back to the template-key heuristic when nodeType says nothing.
  const nodeType = (node.nodeType ?? "").trim().toLowerCase();
  if (nodeType === "column") return "column";
  if (nodeType === "row") return "row";
  if (nodeType === "section" || nodeType === "experience" || nodeType === "page") {
    return "section";
  }

  if (nodeType.length === 0 || nodeType === "structure") {
    const hint = (node.displayTemplateKey ?? "").toLowerCase();
    // Order matters here: "column" must win over "section" in e.g. "ColumnSection".
    if (/column/.test(hint)) return "column";
    if (/row/.test(hint)) return "row";
    if (/section|experience|page|container|blank/.test(hint)) return "section";
  }

  return "unknown";
}

type RenderNodesProps = {
  nodes: CompositionNode[] | null | undefined;
  ctx: RenderContext;
  depth: number;
};

/**
 * Renders a list of composition nodes depth-first. Exported so the layout
 * pieces and the page route can reuse the same traversal rules.
 */
export function RenderNodes({ nodes, ctx, depth }: RenderNodesProps) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  if (depth > MAX_DEPTH) return null;

  return (
    <>
      {nodes.map((node, index) => {
        if (node === null || typeof node !== "object") return null;
        // A stable key from the CMS when present, otherwise positional.
        const key = typeof node.key === "string" && node.key.length > 0 ? node.key : `node-${index}`;
        return <RenderNode key={key} node={node} nodeKey={key} ctx={ctx} depth={depth} />;
      })}
    </>
  );
}

type RenderNodeProps = {
  node: CompositionNode;
  nodeKey: string;
  ctx: RenderContext;
  depth: number;
};

function RenderNode({ node, nodeKey, ctx, depth }: RenderNodeProps) {
  if (depth > MAX_DEPTH) return null;

  if (isComponentNode(node)) {
    return <RenderComponent node={node} nodeKey={nodeKey} ctx={ctx} />;
  }

  if (!isStructureNode(node)) return null;

  const children = <RenderNodes nodes={node.nodes} ctx={ctx} depth={depth + 1} />;
  const kind = classifyStructure(node);

  switch (kind) {
    case "section":
      return (
        <BlankSection node={node} ctx={ctx}>
          {children}
        </BlankSection>
      );
    case "row":
      return (
        <Row node={node} ctx={ctx}>
          {children}
        </Row>
      );
    case "column":
      return (
        <Column node={node} ctx={ctx}>
          {children}
        </Column>
      );
    default:
      // Unrecognised structure: pass the children through so content is never lost.
      return <>{children}</>;
  }
}

function RenderComponent({
  node,
  nodeKey,
  ctx,
}: {
  node: CompositionComponentNode;
  nodeKey: string;
  ctx: RenderContext;
}) {
  const data = node.component;
  if (!data || typeof data !== "object") return null;

  const types = Array.isArray(data._metadata?.types) ? data._metadata?.types : null;
  const Component = resolveBlock(types ?? null);

  if (!Component) {
    return <UnknownBlock types={types ?? undefined} />;
  }

  // createElement, not <Component />: the component is looked up in the block
  // registry at runtime, so a capitalised local would read as a component defined
  // during render (and React's lint rules flag it as such).
  const rendered = createElement(Component, { data, nodeKey, ctx });

  // Edit-mode wrapper only: the on-page editor needs the block id to map a
  // rendered element back to its composition node. Published output stays clean.
  if (ctx.isEditMode) {
    return <div data-epi-block-id={nodeKey}>{rendered}</div>;
  }

  return rendered;
}

export type ExperienceRendererProps = {
  composition?: CompositionStructureNode | null;
  ctx: RenderContext;
};

export default function ExperienceRenderer({ composition, ctx }: ExperienceRendererProps) {
  if (!composition || typeof composition !== "object") return null;

  // The root itself is a structure node; render its children, not the root
  // wrapper, so a page does not gain a redundant outer <section>.
  const nodes = Array.isArray(composition.nodes) ? composition.nodes : null;
  if (nodes && nodes.length > 0) {
    return <RenderNodes nodes={nodes} ctx={ctx} depth={0} />;
  }

  return <RenderNode node={composition} nodeKey={composition.key ?? "root"} ctx={ctx} depth={0} />;
}
