import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ExperienceRenderer from "@/components/ExperienceRenderer";
import { getPageByPath } from "@/lib/queries";

export const revalidate = 60;
export const dynamicParams = true;

const DEFAULT_LOCALE = "en";

/**
 * Allowlist for a single URL segment.
 *
 * Anything that is not an unreserved URL character (or a percent-escape) is
 * rejected outright rather than forwarded to Optimizely Graph. This keeps
 * attacker-controlled text out of the GraphQL variable in the first place and
 * blocks path-traversal shapes before they can reach any upstream lookup.
 */
const SEGMENT_ALLOWLIST = /^[A-Za-z0-9\-_.~%]+$/;

function normalizeSegment(raw: string): string | null {
  if (!raw || raw.length > 200) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — treat as hostile input.
    return null;
  }

  for (const value of [raw, decoded]) {
    if (value.includes("..") || value.includes("\\") || value.includes("/")) return null;
    if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  }

  if (!SEGMENT_ALLOWLIST.test(raw)) return null;

  return decoded;
}

/** Builds the Graph `_metadata.url.default` path, e.g. "/" or "/about/team/". */
function buildPath(slug: string[] | undefined): string | null {
  if (!slug || slug.length === 0) return "/";
  if (slug.length > 12) return null;

  const segments: string[] = [];
  for (const segment of slug) {
    const safe = normalizeSegment(segment);
    if (safe === null) return null;
    segments.push(safe);
  }

  return `/${segments.join("/")}/`;
}

async function loadPage(path: string) {
  try {
    return await getPageByPath(path);
  } catch (error) {
    // Full detail stays on the server; app/error.tsx renders a generic message.
    console.error("[route:[[...slug]]] Graph lookup failed for path", path, error);
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const path = buildPath(slug);
  if (path === null) return { title: "testsiteanik" };

  try {
    const page = await getPageByPath(path);
    const name = page?._metadata?.displayName;
    return { title: name ? `${name} | testsiteanik` : "testsiteanik" };
  } catch {
    // Metadata must never surface upstream failure detail.
    return { title: "testsiteanik" };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;

  const path = buildPath(slug);
  if (path === null) notFound();

  const page = await loadPage(path);
  if (!page) notFound();

  const locale = page._metadata?.locale ?? DEFAULT_LOCALE;

  return (
    /* Full-bleed wrapper: BlankSection and each block own their own gutter and
       max-width, so adding ob-container here would double the padding and make
       full-bleed blocks impossible. lang carries the CMS locale of the content. */
    <main lang={locale}>
      <ExperienceRenderer
        composition={page.composition ?? null}
        ctx={{ isEditMode: false, locale }}
      />
    </main>
  );
}
