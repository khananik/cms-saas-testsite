/**
 * Static, non-per-request security headers.
 *
 * This file emits NO Content-Security-Policy. The complete policy — including
 * `frame-ancestors`, which is what allows the CMS to embed this site in its preview
 * iframe — is built per request in proxy.ts, because it carries a per-request script
 * nonce. Keeping it in one place matters: two CSP headers on one response are enforced as
 * an intersection and can also overwrite one another depending on ordering, which breaks
 * the preview iframe in ways that are very hard to diagnose. Set the embedding origin via
 * the OPTIMIZELY_CMS_HOST environment variable; proxy.ts reads it.
 *
 * X-Frame-Options is intentionally NOT set: it cannot express an allowlist (ALLOW-FROM is
 * dead in every modern browser) and a `SAMEORIGIN` value would contradict frame-ancestors.
 */

/** Exact origin of the CMS, or undefined. Never a wildcard. */
function cmsOrigin() {
  const raw = process.env.OPTIMIZELY_CMS_HOST;
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    // origin only — strips any path/query someone pasted in, which would be
    // invalid in a CSP source expression and could silently void the directive.
    return url.origin;
  } catch {
    return undefined;
  }
}

const CMS_ORIGIN = cmsOrigin();

if (!CMS_ORIGIN) {
  // Warn once at config load so a misconfigured deployment is obvious in the build log.
  console.warn(
    "[next.config] OPTIMIZELY_CMS_HOST is unset or not a valid http(s) origin; " +
      "frame-ancestors (set in proxy.ts) falls back to 'self', so the CMS preview " +
      "iframe will be blocked and /preview cannot load the communication injector.",
  );
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
