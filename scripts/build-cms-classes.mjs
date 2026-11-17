#!/usr/bin/env node
/**
 * Collects the CSS class names used in CMS-authored HTML so Tailwind can generate
 * styles for them at build time.
 *
 * WHY THIS EXISTS
 * Some RawHtmlBlock sections in the CMS are written in Tailwind utility classes
 * (`grid lg:grid-cols-3`, `rounded-full bg-slate-900 px-8`). Tailwind only emits CSS
 * for classes it can see at build time, and this markup is not in our source code —
 * it lives in the CMS. So we fetch it from Graph, extract the class names, and write
 * them to cms-content/raw-html-classes.txt, which app/cms-tailwind.css points
 * Tailwind at with @source.
 *
 * Runs automatically before `next build` (npm "prebuild"). The output file is
 * committed, so a build still works if Graph is unreachable: in that case the
 * previous snapshot is kept and this script exits 0 with a warning.
 *
 * STALENESS: classes an editor adds in the CMS after a deploy are not styled until
 * the next build. Trigger a Vercel redeploy on CMS publish if that matters.
 *
 * SECURITY: only class TOKENS are written, never markup, and each token must pass
 * an allowlist. Tailwind arbitrary values can carry CSS (`bg-[url(...)]`), so any
 * token containing url(, javascript, expression, @, backslash, quotes or braces is
 * dropped before Tailwind ever sees it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(PROJECT_ROOT, "cms-content", "raw-html-classes.txt");
const PAGE_LIMIT = 100;
const MAX_WALK_DEPTH = 40;
const REQUEST_TIMEOUT_MS = 20000;

/** Shape a Tailwind candidate may take: utilities, variants, arbitrary values. */
const TOKEN_SHAPE = /^[A-Za-z0-9_:/.%[\]#(),!*+-]{1,120}$/;
/** Anything that could smuggle CSS-level behaviour through an arbitrary value. */
const TOKEN_BANNED = /url\(|javascript|vbscript|expression|behavior|binding|import|@|\\|["'`{};<>]/i;

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

function keepSnapshot(reason) {
  const exists = fs.existsSync(OUTPUT);
  console.warn(
    `[cms:classes] ${reason} — ${exists ? "keeping the committed snapshot" : "no snapshot exists; CMS Tailwind classes will be unstyled"}.`,
  );
  process.exit(0);
}

const fileEnv = readEnvFile(path.join(PROJECT_ROOT, ".env.local"));
const GRAPH_URL = process.env.OPTIMIZELY_GRAPH_URL ?? fileEnv.OPTIMIZELY_GRAPH_URL;
const SINGLE_KEY = process.env.OPTIMIZELY_GRAPH_SINGLE_KEY ?? fileEnv.OPTIMIZELY_GRAPH_SINGLE_KEY;
if (!GRAPH_URL || !SINGLE_KEY) keepSnapshot("Graph is not configured");

async function graph(query, variables) {
  const response = await fetch(GRAPH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      // The key appears only in this header and is never printed.
      authorization: `epi-single ${SINGLE_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors[0]?.message ?? "GraphQL error");
  return body.data;
}

const NODE = "key nodeType";
const COMPONENT = "... on ICompositionComponentNode { component { _json } }";
const nest = (depth) =>
  depth === 0 ? "" : `... on ICompositionStructureNode { nodes { ${NODE} ${COMPONENT} ${nest(depth - 1)} } }`;

/** Every string that looks like markup, anywhere in a JSON tree (variations included). */
function collectHtml(value, sink, depth = 0) {
  if (depth > MAX_WALK_DEPTH || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.includes("class=")) sink.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHtml(item, sink, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectHtml(item, sink, depth + 1);
  }
}

let pages;
try {
  const data = await graph(
    `{ _Experience(limit: ${PAGE_LIMIT}) { total items { _metadata { url { default } } } } }`,
  );
  pages = data?._Experience ?? null;
} catch (error) {
  keepSnapshot(`could not list pages (${error.message})`);
}

const paths = [
  ...new Set(
    (pages?.items ?? [])
      .map((item) => item?._metadata?.url?.default)
      .filter((value) => typeof value === "string" && value.length > 0),
  ),
];
if (typeof pages?.total === "number" && pages.total > PAGE_LIMIT) {
  console.warn(`[cms:classes] ${pages.total} experiences exist; only the first ${PAGE_LIMIT} were scanned.`);
}

const html = [];
let failures = 0;
for (const urlPath of paths) {
  try {
    const data = await graph(
      `query Page($path: String!) {
         _Experience(where: { _metadata: { url: { default: { eq: $path } } } }, limit: 1) {
           items { composition { ${NODE} ${nest(6)} } }
         }
       }`,
      { path: urlPath },
    );
    collectHtml(data?._Experience?.items?.[0]?.composition, html);
  } catch (error) {
    failures++;
    if (failures === 1) console.warn(`[cms:classes] page fetch failed: ${error.message}`);
  }
}
if (paths.length > 0 && failures === paths.length) keepSnapshot("every page fetch failed");

const tokens = new Set();
let rejected = 0;
for (const markup of html) {
  for (const match of markup.matchAll(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/g)) {
    for (const token of (match[1] ?? match[2] ?? "").split(/\s+/)) {
      if (token.length === 0) continue;
      if (!TOKEN_SHAPE.test(token) || TOKEN_BANNED.test(token)) {
        rejected++;
        continue;
      }
      tokens.add(token);
    }
  }
}

if (tokens.size === 0) keepSnapshot("no classes were found in CMS markup");

const sorted = [...tokens].sort();
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const temp = `${OUTPUT}.tmp`;
fs.writeFileSync(
  temp,
  "# Generated by scripts/build-cms-classes.mjs from CMS-authored HTML. Do not edit.\n" +
    "# Tailwind scans this file (see app/cms-tailwind.css) so CMS markup gets styled.\n" +
    sorted.join("\n") +
    "\n",
);
fs.renameSync(temp, OUTPUT);

console.log(
  `[cms:classes] ${sorted.length} classes from ${html.length} markup fragments on ${paths.length} pages` +
    (rejected > 0 ? ` (${rejected} rejected by the token allowlist)` : "") +
    (failures > 0 ? ` (${failures} page fetches failed)` : ""),
);
