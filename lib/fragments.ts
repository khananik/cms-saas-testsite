/* =============================================================================
 * !! READ THIS BEFORE THE FIRST REAL RUN !!
 *
 * The field names below are a BEST GUESS at the testsiteanik content model.
 * They were written without access to the live Optimizely Graph schema.
 *
 * GraphQL is all-or-nothing: if ONE field named here does not exist on the
 * live type, the WHOLE query fails and every page renders as "not found".
 *
 * So, before the first real run:
 *
 *     npm run graph:introspect
 *
 * That script reads the live schema and REWRITES THIS FILE with only the
 * fields that genuinely exist on each type in BLOCK_TYPE_NAMES (the previous
 * version is kept as lib/fragments.ts.bak). Re-run it whenever the content
 * model changes in the CMS.
 *
 * Hand edits are fine, but they are overwritten by the next introspect run.
 * ========================================================================== */

/** Every block type testsiteanik renders. Also drives scripts/introspect-graph.mjs. */
export const BLOCK_TYPE_NAMES: string[] = [
  "HeroBlock",
  "SectionHeadingBlock",
  "ProductCardBlock",
  "TestimonialBlock",
  "CustomerVoicesBlock",
  "LogoGridBlock",
  "StatsCounterBlock",
  "FeaturedContentBlock",
  "FaqContainerBlock",
  "FaqItem",
  "CallToAction",
  "RawHtmlBlock",
];

/**
 * Inline fragments selected on the `component` field of a composition
 * component node. One per entry in BLOCK_TYPE_NAMES.
 */
export const BLOCK_FRAGMENTS: string = `
  ... on HeroBlock {
    heading
    subheading
    eyebrow
    body { html }
    image { url { default } }
    imageAlt
    cta { url { default } text title }
  }

  ... on SectionHeadingBlock {
    heading
    subheading
    eyebrow
    alignment
    body { html }
  }

  ... on ProductCardBlock {
    heading
    subheading
    description { html }
    price
    badge
    image { url { default } }
    imageAlt
    link { url { default } text title }
  }

  ... on TestimonialBlock {
    quote { html }
    authorName
    authorTitle
    company
    rating
    image { url { default } }
  }

  ... on CustomerVoicesBlock {
    heading
    subheading
    testimonials {
      quote { html }
      authorName
      authorTitle
      company
      image { url { default } }
    }
  }

  ... on LogoGridBlock {
    heading
    subheading
    logos {
      name
      image { url { default } }
      link { url { default } text title }
    }
  }

  ... on StatsCounterBlock {
    heading
    subheading
    stats {
      value
      label
      prefix
      suffix
    }
  }

  ... on FeaturedContentBlock {
    heading
    subheading
    body { html }
    image { url { default } }
    imageAlt
    mediaPosition
    link { url { default } text title }
  }

  ... on FaqContainerBlock {
    heading
    subheading
    items {
      question
      answer { html }
    }
  }

  ... on FaqItem {
    question
    answer { html }
  }

  ... on CallToAction {
    heading
    subheading
    body { html }
    style
    link { url { default } text title }
  }

  ... on RawHtmlBlock {
    heading
    html { html }
  }
`;
