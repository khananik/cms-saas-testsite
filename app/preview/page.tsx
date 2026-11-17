import type { Metadata } from "next";
import { headers } from "next/headers";

import ExperienceRenderer from "@/components/ExperienceRenderer";
import { getPreviewContent } from "@/lib/queries";

import PreviewBridge from "./PreviewBridge";

/** Draft content must never be cached or revalidated. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Preview | testsiteanik",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/* ------------------------------------------------------------------
   Query-parameter allowlists.

   Every value arrives from the CMS edit view via the browser and is
   therefore untrusted. Each one is validated against a strict pattern
   before it is used; anything that fails produces a generic "Preview
   unavailable" render that never echoes the submitted value.
   ------------------------------------------------------------------ */

const PATTERNS = {
  key: /^[A-Za-z0-9_-]{1,100}$/,
  ver: /^[A-Za-z0-9_.-]{1,50}$/,
  loc: /^[A-Za-z0-9_-]{1,20}$/,
  token: /^[A-Za-z0-9_.-]{1,4096}$/,
} as const;

const ALLOWED_CTX = ["edit", "preview", "default"] as const;
type PreviewCtx = (typeof ALLOWED_CTX)[number];

function single(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  // Repeated parameters are rejected rather than silently taking the first.
  return undefined;
}

function PreviewUnavailable({
  cmsHost,
  nonce,
}: {
  cmsHost?: string | undefined;
  nonce?: string | undefined;
}) {
  return (
    <>
      <div className="ob-container" style={{ paddingBlock: "var(--ob-space-6)" }}>
        <h1>Preview unavailable</h1>
        <p style={{ color: "var(--ob-muted)", marginTop: "var(--ob-space-3)" }}>
          This preview could not be loaded. Please reopen the preview from the CMS.
        </p>
      </div>
      {/* The bridge still loads on failure so the CMS edit view can connect and a
          re-save can refresh the frame instead of leaving the editor stuck. */}
      {cmsHost ? <PreviewBridge cmsHost={cmsHost} nonce={nonce} /> : null}
    </>
  );
}

/** Returns the CMS origin only when it is a well-formed https origin. */
function readCmsOrigin(): string | undefined {
  const raw = process.env.OPTIMIZELY_CMS_HOST;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const cmsHost = readCmsOrigin();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const key = single(params.key);
  const ver = single(params.ver);
  const loc = single(params.loc);
  const ctxRaw = single(params.ctx) ?? "preview";
  const previewToken = single(params.preview_token);

  // key and preview_token are mandatory. ver and loc are optional — some CMS preview
  // links omit them — but when present they must still satisfy the pattern.
  if (
    !key ||
    !PATTERNS.key.test(key) ||
    (ver !== undefined && !PATTERNS.ver.test(ver)) ||
    (loc !== undefined && !PATTERNS.loc.test(loc)) ||
    !previewToken ||
    !PATTERNS.token.test(previewToken) ||
    !(ALLOWED_CTX as readonly string[]).includes(ctxRaw)
  ) {
    // No detail, no parameter echo — a failed check looks the same whichever
    // check failed, so the page cannot be used to probe token shapes.
    console.warn("[route:/preview] Rejected preview request: parameter validation failed");
    return <PreviewUnavailable cmsHost={cmsHost} nonce={nonce} />;
  }

  const ctx = ctxRaw as PreviewCtx;

  // The token is used here and nowhere else: it goes straight into the
  // Authorization header inside graphQuery. It is never rendered, never logged
  // and never handed to a client component.
  let content;
  try {
    content = await getPreviewContent({ key, version: ver, locale: loc, previewToken });
  } catch (error) {
    console.error("[route:/preview] Draft fetch failed for key", key, "version", ver, error);
    return <PreviewUnavailable cmsHost={cmsHost} nonce={nonce} />;
  }

  if (!content) return <PreviewUnavailable cmsHost={cmsHost} nonce={nonce} />;

  return (
    <>
      <div lang={loc ?? undefined}>
        <ExperienceRenderer
          composition={content.composition ?? null}
          ctx={{ isEditMode: ctx === "edit", locale: loc }}
        />
      </div>
      {cmsHost ? <PreviewBridge cmsHost={cmsHost} nonce={nonce} version={ver} /> : null}
    </>
  );
}
