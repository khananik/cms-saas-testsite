import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { OPTIMIZELY_FRAME_ORIGIN } from "./lib/optimizely";

/**
 * The single Content-Security-Policy for this site, built per request.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`, so this lives in
 * proxy.ts and default-exports `proxy`.
 *
 * This file is the ONLY place a Content-Security-Policy header is emitted. next.config.mjs
 * deliberately sets no CSP: two CSP headers on one response are enforced independently as
 * an intersection, and depending on header ordering one can also be overwritten outright,
 * so a split policy is silently fragile. `frame-ancestors` therefore lives here too —
 * that is the directive that lets the CMS embed this site in its preview iframe.
 *
 * The nonce comes from Web Crypto (edge-safe, cryptographically random). Math.random must
 * never be used here: a guessable nonce makes 'strict-dynamic' worthless.
 */

const NONCE_BYTES = 16;

function createNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Exact CMS origin, or undefined. Never a wildcard, never an attacker-controlled string. */
function cmsOrigin(): string | undefined {
  const raw = process.env.OPTIMIZELY_CMS_HOST;
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export default function proxy(request: NextRequest) {
  const nonce = createNonce();
  const isDev = process.env.NODE_ENV === "development";
  const cms = cmsOrigin();

  // The CMS origin is needed in script-src so /preview can load
  // <cms-host>/util/javascript/communicationinjector.js, and in frame-src because the
  // injector talks to the surrounding editor frame.
  const cmsSource = cms ? ` ${cms}` : "";

  // 'strict-dynamic' makes browsers that support it ignore the host allowlist in
  // script-src and trust only nonce-loaded scripts plus what they load; `https:` is the
  // fallback for older browsers that do not understand 'strict-dynamic'.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https:${cmsSource}`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${cmsSource}`;

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    scriptSrc,
    // style-src needs 'unsafe-inline': React/Next inject style attributes and the CMS
    // on-page editing chrome injects inline styles. Nonced styles are not workable here.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    // `https:` does not cover WebSockets; Opal connects over wss:// to Optimizely hosts.
    // Scoped to *.optimizely.com rather than a bare `wss:`.
    "connect-src 'self' https: wss://*.optimizely.com",
    // Optimizely Web's snippet embeds an iframe from its project-specific origin.
    // The snippet itself needs no script-src entry: under 'strict-dynamic' host
    // allowlists are ignored, so the nonce on its tag (app/layout.tsx) is what
    // authorises it.
    `frame-src 'self'${cmsSource} ${OPTIMIZELY_FRAME_ORIGIN}`,
    // Clickjacking / embedding control: only this origin and the CMS may frame the site.
    // Never widen this to a wildcard. X-Frame-Options is intentionally not set — it cannot
    // express an allowlist and a SAMEORIGIN value would contradict this directive.
    `frame-ancestors 'self'${cmsSource}`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];

  const csp = directives.join("; ").replace(/\s{2,}/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  // Strip any inbound x-nonce so a client cannot choose the nonce our pages will trust.
  requestHeaders.delete("x-nonce");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every path except static assets and prefetches, which need no CSP and
     * would only burn a nonce per file:
     *  - _next/static, _next/image
     *  - favicon / icons / manifest / robots / sitemap
     *  - common static file extensions
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff|woff2|ttf|otf|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
