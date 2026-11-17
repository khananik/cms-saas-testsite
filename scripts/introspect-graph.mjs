#!/usr/bin/env node
/**
 * Rewrites lib/fragments.ts from the LIVE Optimizely Graph schema.
 *
 *   npm run graph:introspect
 *
 * Why: a GraphQL query that names a field which does not exist fails in full,
 * so the hand-written best-guess fragments must be replaced by real ones
 * before the first run.
 *
 * Secrets: the single key is read from the environment (or .env.local) and is
 * only ever placed in an Authorization header. It is never printed, never put
 * in a URL, and never written to the generated file.
 *
 * Plain Node ESM. No dependencies, no TypeScript.
 */

import { readFile, writeFile, rename, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** Fixed root: every output path is resolved from here and verified. */
const PROJECT_ROOT = "/Users/khananik.rahman/Desktop/cms-saas-testsite";

const FRAGMENTS_FILE = resolveInRoot("lib/fragments.ts");
const BACKUP_FILE = resolveInRoot("lib/fragments.ts.bak");
const TEMP_FILE = resolveInRoot("lib/.fragments.ts.tmp");
const ENV_FILE = resolveInRoot(".env.local");

const DEFAULT_BLOCK_TYPE_NAMES = [
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

const MAX_SUBFIELDS = 10;
const REQUEST_TIMEOUT_MS = 20_000;

/** Guards against path traversal: nothing may escape PROJECT_ROOT. */
function resolveInRoot(relative) {
  const resolved = path.resolve(PROJECT_ROOT, relative);
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error(`Refusing to write outside the project root: ${relative}`);
  }
  return resolved;
}

function fail(message) {
  console.error(`\n[graph:introspect] ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ env --- */

/** Tiny .env parser: handles quotes, "export ", # comments; ignores junk. */
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();

    const eq = line.indexOf("=");
    if (eq <= 0) continue; // malformed - ignore

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

async function loadEnv() {
  let url = process.env.OPTIMIZELY_GRAPH_URL;
  let key = process.env.OPTIMIZELY_GRAPH_SINGLE_KEY;

  if (!url || !key) {
    try {
      const parsed = parseEnv(await readFile(ENV_FILE, "utf8"));
      url = url || parsed.OPTIMIZELY_GRAPH_URL;
      key = key || parsed.OPTIMIZELY_GRAPH_SINGLE_KEY;
    } catch {
      /* no .env.local - fall through to the check below */
    }
  }

  url = (url || "").trim();
  key = (key || "").trim();

  if (!url || !key) {
    fail(
      "OPTIMIZELY_GRAPH_URL and OPTIMIZELY_GRAPH_SINGLE_KEY must be set in the\n" +
        "environment or in .env.local before introspection can run.",
    );
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    fail("OPTIMIZELY_GRAPH_URL is not a valid URL.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    fail("OPTIMIZELY_GRAPH_URL must use https.");
  }
  return { url, key };
}

/* --------------------------------------------------------- introspection --- */

const INTROSPECTION_QUERY = `
  query IntrospectBlocks {
    __schema {
      types {
        kind
        name
        fields(includeDeprecated: false) {
          name
          args { name type { kind name ofType { kind name } } }
          type {
            kind name
            ofType { kind name ofType { kind name ofType { kind name } } }
          }
        }
      }
    }
  }
`;

async function introspect(url, key) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `epi-single ${key}`,
      },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    fail(`Could not reach Optimizely Graph: ${cause?.name || "request failed"}`);
  }

  if (!response.ok) {
    // Status only - the body can echo the request, including headers.
    fail(`Optimizely Graph returned HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    fail("Optimizely Graph returned a response that is not JSON.");
  }

  if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
    const messages = payload.errors
      .map((error) => (error && typeof error.message === "string" ? error.message : "unknown error"))
      .join("; ");
    fail(`Introspection failed: ${messages}`);
  }

  const types = payload?.data?.__schema?.types;
  if (!Array.isArray(types)) fail("Introspection returned no schema types.");
  return types;
}

/* ----------------------------------------------------------- generation --- */

/** Strip NON_NULL / LIST wrappers down to the named type. */
function namedType(type) {
  let current = type;
  while (current && !current.name && current.ofType) current = current.ofType;
  return current && current.name ? current : null;
}

function isScalarKind(kind) {
  return kind === "SCALAR" || kind === "ENUM";
}

function hasRequiredArgs(field) {
  if (!Array.isArray(field.args)) return false;
  return field.args.some((arg) => arg?.type?.kind === "NON_NULL");
}

/** Build the selection lines for one block type. */
function buildFields(typeName, typeMap, indent) {
  const type = typeMap.get(typeName);
  const lines = [];

  for (const field of type.fields || []) {
    const name = field?.name;
    if (typeof name !== "string" || name.startsWith("_")) continue;
    if (hasRequiredArgs(field)) continue;

    const target = namedType(field.type);
    if (!target) continue;

    if (isScalarKind(target.kind)) {
      lines.push(`${indent}${name}`);
      continue;
    }

    // One level of simple object fields, e.g. url { default } / { html }.
    const nested = typeMap.get(target.name);
    if (!nested || !Array.isArray(nested.fields)) continue;

    const subfields = [];
    for (const sub of nested.fields) {
      if (typeof sub?.name !== "string" || sub.name.startsWith("_")) continue;
      if (hasRequiredArgs(sub)) continue;
      const subTarget = namedType(sub.type);
      if (!subTarget || !isScalarKind(subTarget.kind)) continue;
      subfields.push(sub.name);
      if (subfields.length >= MAX_SUBFIELDS) break;
    }
    if (subfields.length === 0) continue;

    lines.push(`${indent}${name} { ${subfields.join(" ")} }`);
  }

  return lines;
}

function renderFile(blockTypeNames, typeMap, generatedAt, graphHost) {
  const fragments = blockTypeNames
    .map((typeName) => {
      const fields = buildFields(typeName, typeMap, "      ");
      const body = fields.length > 0 ? fields.join("\n") : "      __typename";
      return `  ... on ${typeName} {\n${body}\n  }`;
    })
    .join("\n\n");

  const namesLiteral = blockTypeNames.map((name) => `  "${name}",`).join("\n");

  return `/* =============================================================================
 * GENERATED FILE - do not edit by hand.
 *
 * Written by scripts/introspect-graph.mjs from the live Optimizely Graph
 * schema at ${graphHost} on ${generatedAt}.
 * The previous version was kept as lib/fragments.ts.bak.
 *
 * Re-run after any content-model change:
 *
 *     npm run graph:introspect
 * ========================================================================== */

/** Every block type testsiteanik renders. Also drives scripts/introspect-graph.mjs. */
export const BLOCK_TYPE_NAMES: string[] = [
${namesLiteral}
];

/**
 * Inline fragments selected on the \`component\` field of a composition
 * component node. Only fields that exist on the live schema are listed.
 */
export const BLOCK_FRAGMENTS: string = \`
${fragments}
\`;
`;
}

/* ----------------------------------------------------------------- main --- */

async function readBlockTypeNames() {
  try {
    const source = await readFile(FRAGMENTS_FILE, "utf8");
    const match = source.match(/BLOCK_TYPE_NAMES[^=]*=\s*\[([^\]]*)\]/);
    if (match) {
      const names = [...match[1].matchAll(/["']([A-Za-z0-9_]+)["']/g)].map((m) => m[1]);
      if (names.length > 0) return names;
    }
  } catch {
    /* first run - fall back to the built-in list */
  }
  return DEFAULT_BLOCK_TYPE_NAMES;
}

async function main() {
  const { url, key } = await loadEnv();
  const blockTypeNames = await readBlockTypeNames();

  const types = await introspect(url, key);
  const typeMap = new Map();
  for (const type of types) {
    if (type && typeof type.name === "string") typeMap.set(type.name, type);
  }

  const missing = blockTypeNames.filter((name) => {
    const type = typeMap.get(name);
    return !type || (type.kind !== "OBJECT" && type.kind !== "INTERFACE");
  });

  if (missing.length > 0) {
    fail(
      `These content types are not in the Optimizely Graph schema:\n` +
        missing.map((name) => `  - ${name}`).join("\n") +
        `\n\nNothing was written. Either the type is named differently in the CMS,\n` +
        `or it has not been published to Graph yet. Fix the names in\n` +
        `BLOCK_TYPE_NAMES (lib/fragments.ts) and re-run.`,
    );
  }

  const graphHost = new URL(url).host;
  const contents = renderFile(blockTypeNames, typeMap, new Date().toISOString(), graphHost);

  try {
    await copyFile(FRAGMENTS_FILE, BACKUP_FILE);
  } catch {
    /* no previous file to back up */
  }

  await mkdir(path.dirname(TEMP_FILE), { recursive: true });
  await writeFile(TEMP_FILE, contents, { encoding: "utf8", mode: 0o644 });
  await rename(TEMP_FILE, FRAGMENTS_FILE); // atomic within the same directory

  console.log(
    `[graph:introspect] wrote lib/fragments.ts for ${blockTypeNames.length} block types ` +
      `(backup: lib/fragments.ts.bak)`,
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected failure.");
});
