#!/usr/bin/env node
/**
 * Discovery tool for the Optimizely Graph content model.
 *
 * The app does NOT need this to run. Pages are queried with `_json`, which returns
 * every authored field of a block, so adding a block type in the CMS needs no query
 * change here. Use this when you are writing a new block component and want to know
 * what fields that type actually carries in this instance.
 *
 *   npm run graph:types              list block types in use, counts, depth, coverage
 *   npm run graph:types HeroBlock    print a real sample of that type's authored fields
 *
 * Reads OPTIMIZELY_GRAPH_URL and OPTIMIZELY_GRAPH_SINGLE_KEY from the environment,
 * falling back to .env.local. The key is sent in the Authorization header and is
 * never printed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_SCAN_LIMIT = 40;
const MAX_WALK_DEPTH = 12;
const REQUEST_TIMEOUT_MS = 20000;

/** Minimal .env parser: KEY=value, optional quotes, # comments, malformed lines ignored. */
function readEnvFile(file) {
  const out = {};
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    out[match[1]] = value;
  }
  return out;
}

const fileEnv = readEnvFile(path.join(PROJECT_ROOT, ".env.local"));
const GRAPH_URL = process.env.OPTIMIZELY_GRAPH_URL ?? fileEnv.OPTIMIZELY_GRAPH_URL;
const SINGLE_KEY = process.env.OPTIMIZELY_GRAPH_SINGLE_KEY ?? fileEnv.OPTIMIZELY_GRAPH_SINGLE_KEY;

if (!GRAPH_URL || !SINGLE_KEY) {
  console.error(
    "\n[graph:types] OPTIMIZELY_GRAPH_URL and OPTIMIZELY_GRAPH_SINGLE_KEY must be set\n" +
      "in the environment or in .env.local. The Single key is in the CMS dashboard\n" +
      "under Render Content.\n",
  );
  process.exit(1);
}

async function graph(query, variables) {
  let response;
  try {
    response = await fetch(GRAPH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `epi-single ${SINGLE_KEY}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    console.error("[graph:types] Could not reach Optimizely Graph. Check OPTIMIZELY_GRAPH_URL.");
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`[graph:types] Graph returned HTTP ${response.status}.`);
    process.exit(1);
  }
  const body = await response.json();
  if (body.errors) {
    console.error("[graph:types] Graph reported errors:");
    for (const error of body.errors) console.error(`  - ${error.message}`);
    process.exit(1);
  }
  return body.data;
}

const NODE = "key nodeType displayName displayTemplateKey";
const COMPONENT =
  "... on ICompositionComponentNode { component { _metadata { key types } _json } }";
const nest = (depth) =>
  depth === 0
    ? ""
    : `... on ICompositionStructureNode { nodes { ${NODE} ${COMPONENT} ${nest(depth - 1)} } }`;

const pageData = await graph(
  `{ _Experience(limit: ${PAGE_SCAN_LIMIT}) { items { _metadata { url { default } } } } }`,
);
const paths = [
  ...new Set(
    (pageData?._Experience?.items ?? [])
      .map((item) => item?._metadata?.url?.default)
      .filter((value) => typeof value === "string" && value.length > 0),
  ),
];

const counts = {};
const firstDepth = {};
const samples = {};
let deepest = 0;

for (const urlPath of paths) {
  const data = await graph(
    `query Page($path: String!) {
       _Experience(where: { _metadata: { url: { default: { eq: $path } } } }, limit: 1) {
         items { composition { ${NODE} ${nest(6)} } }
       }
     }`,
    { path: urlPath },
  );
  const composition = data?._Experience?.items?.[0]?.composition;

  const walk = (node, depth) => {
    if (node === null || typeof node !== "object" || depth > MAX_WALK_DEPTH) return;
    deepest = Math.max(deepest, depth);
    const type = node.component?._metadata?.types?.[0];
    if (typeof type === "string") {
      counts[type] = (counts[type] ?? 0) + 1;
      firstDepth[type] ??= depth;
      samples[type] ??= node.component._json;
    }
    for (const child of node.nodes ?? []) walk(child, depth + 1);
  };
  walk(composition, 0);
}

const requested = process.argv[2];

if (requested) {
  const sample = samples[requested];
  if (sample === undefined || sample === null) {
    console.error(
      `\n[graph:types] No published "${requested}" block was found on the ` +
        `${paths.length} experience pages scanned.\n` +
        `Run without arguments to see which types are in use.\n`,
    );
    process.exit(1);
  }
  // Internal bookkeeping fields are noise when you are writing a component.
  const authored = Object.fromEntries(
    Object.entries(sample).filter(([key]) => !key.startsWith("_") && key !== "__typename"),
  );
  const firstField = Object.keys(authored)[0] ?? "field";
  console.log(`\nReal "${requested}" content from this instance:\n`);
  console.log(JSON.stringify(authored, null, 2));
  console.log(
    `\nRead these with the lib/fields.ts helpers, e.g. pickString(data, "${firstField}").\n`,
  );
  process.exit(0);
}

let registered = [];
try {
  registered = fs
    .readdirSync(path.join(PROJECT_ROOT, "components", "blocks"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => name.replace(/\.tsx$/, ""));
} catch {
  // Listing is a convenience; carry on without the coverage column.
}

const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log(`\nScanned ${paths.length} experience pages. Deepest composition level: ${deepest}.\n`);
console.log("Block type in use           count  depth  component");
console.log("-".repeat(58));
for (const [type, count] of rows) {
  const covered = registered.includes(type) ? "yes" : "NO - renders nothing";
  console.log(
    `${type.padEnd(28)}${String(count).padStart(3)}  ${String(firstDepth[type]).padStart(5)}  ${covered}`,
  );
}
console.log(`\nRun "npm run graph:types <TypeName>" for a real sample of one type.\n`);
