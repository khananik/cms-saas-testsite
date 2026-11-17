import type React from "react";
import type { BlockData, RenderContext } from "../lib/types";

import HeroBlock from "./blocks/HeroBlock";
import SectionHeadingBlock from "./blocks/SectionHeadingBlock";
import ProductCardBlock from "./blocks/ProductCardBlock";
import TestimonialBlock from "./blocks/TestimonialBlock";
import CustomerVoicesBlock from "./blocks/CustomerVoicesBlock";
import LogoGridBlock from "./blocks/LogoGridBlock";
import StatsCounterBlock from "./blocks/StatsCounterBlock";
import FeaturedContentBlock from "./blocks/FeaturedContentBlock";
import FaqContainerBlock from "./blocks/FaqContainerBlock";
import FaqItemBlock from "./blocks/FaqItemBlock";
import CallToAction from "./blocks/CallToAction";
import RawHtmlBlock from "./blocks/RawHtmlBlock";

export type BlockComponentProps = {
  data: BlockData;
  nodeKey: string;
  ctx: RenderContext;
};

export type BlockComponent = React.ComponentType<BlockComponentProps>;

/**
 * Graph content type name -> React component. Each key is registered both as
 * written and lowercased, because instances differ in casing.
 */
function register(entries: Record<string, BlockComponent>): Record<string, BlockComponent> {
  const map: Record<string, BlockComponent> = {};
  for (const [name, component] of Object.entries(entries)) {
    map[name] = component;
    map[name.toLowerCase()] = component;
  }
  return map;
}

export const blockRegistry: Record<string, BlockComponent> = register({
  HeroBlock,
  SectionHeadingBlock,
  ProductCardBlock,
  TestimonialBlock,
  CustomerVoicesBlock,
  LogoGridBlock,
  StatsCounterBlock,
  FeaturedContentBlock,
  FaqContainerBlock,
  FaqItemBlock,
  CallToAction,
  RawHtmlBlock,
});

/**
 * Graph returns `_metadata.types` most-specific-first. The first registered
 * match wins; an unregistered type simply renders nothing.
 */
export function resolveBlock(types: string[] | null | undefined): BlockComponent | undefined {
  if (!Array.isArray(types)) return undefined;
  for (const type of types) {
    if (typeof type !== "string") continue;
    const match = blockRegistry[type] ?? blockRegistry[type.toLowerCase()];
    if (match) return match;
  }
  return undefined;
}
