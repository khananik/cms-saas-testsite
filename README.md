# testsiteanik — Next.js head

This is the front end for **testsiteanik**, our Optimizely CMS SaaS site. The CMS stores the
content and the Visual Builder composition; this app reads it from **Optimizely Graph** and
renders it. It does five jobs:

1. Queries Graph for pages.
2. Renders the Visual Builder layout (sections → rows → columns → blocks).
3. Renders one React component per block type.
4. Serves `/preview`, so editors see drafts inside the CMS.
5. Allows the CMS to embed it in an iframe.

Stack: Next.js 16 App Router, React 19, TypeScript (strict). No Tailwind, no CSS-in-JS —
design tokens in `app/globals.css` plus one CSS Module per block. All dependency versions are
pinned exactly.

**Node 22.12+ is required** (`sanitize-html`). Check with `node -v` before `npm install`.

## File map

| Path | What it does |
| --- | --- |
| `.env.local.example` | Template for the three environment variables; copy it to `.env.local`. |
| `next.config.mjs` | Static security headers (nosniff, Referrer-Policy, Permissions-Policy, HSTS). It emits no CSP. |
| `proxy.ts` | The whole Content-Security-Policy, built per request with a fresh nonce — including `frame-ancestors`, which is what lets the CMS iframe us. (Next.js 16 renamed the `middleware` convention to `proxy`.) |
| `lib/types.ts` | Shared TypeScript types for Graph content and composition nodes, plus node type guards. |
| `lib/graph.ts` | The Graph query helper: auth headers, caching, timeouts, error handling. Server-only. |
| `lib/queries.ts` | The GraphQL documents: page-by-URL and page-by-version (preview). |
| `lib/fragments.ts` | Per-block GraphQL fragments — **regenerate these from the live schema, see setup**. |
| `lib/fields.ts` | Tolerant field readers (`pickString`, `pickHtml`, `pickImage`, `pickLink`, `pickList`, `pickNumber`). |
| `lib/url.ts` | `safeHref` / `safeImageSrc` — URL allowlisting. |
| `lib/sanitize.ts` | `sanitizeHtml` — `sanitize-html` with an explicit tag, attribute and scheme allowlist. |
| `app/layout.tsx` | Root layout, fonts, global CSS. |
| `app/[[...slug]]/page.tsx` | Published pages, looked up by URL path. |
| `app/preview/page.tsx` | Draft pages for the CMS preview iframe. |
| `app/preview/PreviewBridge.tsx` | Loads the CMS communication injector and handles CMS messages. |
| `app/error.tsx`, `app/not-found.tsx` | Error and 404 pages. |
| `components/ExperienceRenderer.tsx` | Walks the composition tree and renders each node. |
| `components/registry.ts` | Maps a Graph content type name to a React component. |
| `components/layout/` | `BlankSection`, `Row`, `Column` — the structural pieces. |
| `components/blocks/` | One component (plus CSS Module) per block type. |
| `scripts/introspect-graph.mjs` | Reads the live Graph schema and rewrites `lib/fragments.ts`. |

## First-time setup

```bash
cd my-site            # this repo
npm install
cp .env.local.example .env.local
```

Then fill in `.env.local`:

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `OPTIMIZELY_GRAPH_URL` | Graph GraphQL endpoint | Usually `https://cg.optimizely.com/content/v2` |
| `OPTIMIZELY_GRAPH_SINGLE_KEY` | Graph **Single key** used to read published content | CMS dashboard → **Render Content** → Graph keys |
| `OPTIMIZELY_CMS_HOST` | Full origin of the CMS instance, e.g. `https://example.cms.optimizely.com` | Your CMS URL (scheme + host, no trailing slash) |

All three are **server-only**. Never prefix any of them with `NEXT_PUBLIC_` — that would inline
the Graph key into the browser bundle.

### IMPORTANT: regenerate the fragments before you run anything

```bash
npm run graph:introspect
```

The field names committed in `lib/fragments.ts` are a **guess**, written before anyone had
read this instance's schema. Graph property names differ per instance, and a single wrong field
name makes the **entire** GraphQL query fail — not just that block, the whole page. The script
introspects the live schema using your `.env.local` values and rewrites `lib/fragments.ts` to
match. Run it after setup, and again whenever a content type changes in the CMS.

### Run it

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint
```

## How the published route works

`app/[[...slug]]/page.tsx` is an optional catch-all. It joins the URL segments into a path
(`/products/widgets/`) and asks Graph for the page whose `_metadata.url.default` matches that
path. No match → `notFound()`. The request is authenticated with the Graph Single key
(`Authorization: epi-single …`) and cached with Next.js revalidation, so published pages are
served fast and refresh on their own.

The page's `composition` comes back as a tree; `ExperienceRenderer` walks it and renders the
blocks through the registry.

## How the preview route works

Our SaaS CMS opens the preview iframe at:

```
/preview?key=<contentKey>&ver=<version>&loc=<locale>&ctx=edit&preview_token=<jwt>
```

`app/preview/page.tsx` reads those parameters and fetches **that exact version** from Graph
using `preview_token` as a `Bearer` token. That happens in server code only — the token is
never rendered, never logged, and never reaches the browser. Preview responses are fetched with
`cache: "no-store"`, so a draft is never cached or served to anyone else.

`PreviewBridge` then loads the CMS communication injector:

```
https://<your-cms-host>/util/javascript/communicationinjector.js
```

That script is what lets the CMS talk to the iframe (on-page editing, re-render on change). The
host comes from `OPTIMIZELY_CMS_HOST`, and `PreviewBridge` checks the origin of every incoming
`postMessage` before acting on it.

> **Note on the published docs.** Optimizely's Next.js live-preview guide still describes the
> **CMS 12** draft route, `/episerver/CMS/Content/...`. That does **not** apply to this site.
> Our SaaS instance sends the `/preview?key=…&preview_token=…` format above, and that is the
> only format this route implements. If you follow the older guide you will build a route the
> CMS never calls.

## Adding a new block type

1. **Write the component** in `components/blocks/<Name>.tsx` with a default export taking
   `{ data, nodeKey, ctx }`, plus a `<Name>.module.css` beside it using only `var(--ob-*)`
   tokens. Read fields through `lib/fields.ts` helpers with several candidate names — never
   index `data` directly. Return `null` when there is nothing to show.
2. **Register it** in `components/registry.ts` under its **Graph content type name** (the name
   as it appears in Graph, e.g. `HeroBlock`). Lookup is case-insensitive.
3. **Add its fragment** by re-running `npm run graph:introspect`, so the query actually asks
   Graph for that block's fields.

> **A block with no registered component simply does not render.** It is skipped silently —
> no error, no placeholder in production. If an editor says "my block is missing from the page",
> this is almost always why.

Currently registered: `HeroBlock`, `SectionHeadingBlock`, `ProductCardBlock`, `TestimonialBlock`,
`CustomerVoicesBlock`, `LogoGridBlock`, `StatsCounterBlock`, `FeaturedContentBlock`,
`FaqContainerBlock` (with `FaqItem`), `CallToAction`, `RawHtmlBlock`.

## Deploying to Vercel

Import the repo, framework preset **Next.js**, then under **Settings → Environment Variables**
add the same three variables — `OPTIMIZELY_GRAPH_URL`, `OPTIMIZELY_GRAPH_SINGLE_KEY`,
`OPTIMIZELY_CMS_HOST` — enabled for **Production, Preview and Development**.

Set `OPTIMIZELY_CMS_HOST` **before the first build**. `next.config.mjs` reads it at build time to
construct the `frame-ancestors` directive. If it is missing or wrong at build time, the CMS
origin is not in the allowlist and the preview iframe comes up blank; you have to fix the
variable and redeploy.

Finally, point the CMS preview/site URL at the deployed domain.

## Security notes

These are deliberate controls, not incidental. Please keep them in place:

- **Graph Single key and preview token are server-only.** They live in server env and in server
  `Authorization` headers. They are never in a `NEXT_PUBLIC_` variable, a client component, a
  URL we construct, a log line, or an error message.
- **CSP with a per-request nonce** in `proxy.ts`, so injected inline scripts do not execute.
  The whole policy is emitted from that one file on purpose: two `Content-Security-Policy`
  headers on one response are enforced as an intersection and can overwrite each other, which
  breaks the preview iframe in ways that are very hard to diagnose. Do not add a CSP to
  `next.config.mjs`.
- **`frame-ancestors` pinned to the CMS origin** (in `proxy.ts`, from `OPTIMIZELY_CMS_HOST`) —
  the CMS can frame us, nobody else can. Never widen it to a wildcard.
- **`RawHtmlBlock` and all rich text are sanitised** through `lib/sanitize.ts` (an explicit tag,
  attribute and scheme allowlist). `dangerouslySetInnerHTML` is used only on sanitised output.
  Do not swap this for DOMPurify: `lib/sanitize.ts` is reached from client components as well as
  server ones, so it has to run in both, and the usual Node shim for DOMPurify
  (`isomorphic-dompurify` → jsdom) cannot be loaded by Vercel's bundled runtime — jsdom's
  `html-encoding-sniffer` `require()`s an ESM module and throws `ERR_REQUIRE_ESM` at import
  time, which takes down every route. `sanitize-html` parses with htmlparser2 and needs no DOM.
- **The postMessage origin check in `PreviewBridge`** — messages from any origin other than the
  CMS host are ignored.
- **URL allowlisting in `lib/url.ts`** — only relative paths and `http`/`https`/`mailto`/`tel`.
  `javascript:` and `data:` links are dropped, not rendered.
- **Preview responses are never cached** (`cache: "no-store"`), so drafts cannot leak into a
  shared cache.
- **Exact pinned dependency versions** (no `^`, no `~`), so a build cannot silently pull a
  changed transitive package.

One thing we cannot fix from this side: the CMS puts `preview_token` in the **preview URL**, so
it is visible in the browser address bar and in the page's router payload. That is the format
the SaaS CMS sends and the route has to accept it. What we do about it: the token is never
re-emitted by our own code, never reaches a client component, and `Referrer-Policy:
strict-origin-when-cross-origin` keeps it out of outbound `Referer` headers. Preview links are
short-lived — treat one like a password and do not paste it into tickets or chat.

Questions about this repo: ask the web team. Access or tooling problems: IT@optimizely.com.
