/**
 * The public origin of this site (scheme + host), used where an ABSOLUTE URL is
 * required — today the sitemap and robots.txt, which search engines read.
 *
 * Read from SITE_URL, falling back to Vercel's VERCEL_PROJECT_PRODUCTION_URL (a bare
 * hostname). Server-only by convention: neither variable is NEXT_PUBLIC_.
 *
 * Returns undefined rather than guessing when nothing usable is configured: a
 * sitemap pointing at the wrong host is worse than no sitemap.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function siteOrigin(): string | undefined {
  const explicit = process.env.SITE_URL?.trim();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw = explicit || (vercelHost ? `https://${vercelHost}` : undefined);
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    // https only; plain http is tolerated for local development hosts.
    if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
      return undefined;
    }
    // Origin only — drops any path, query or credentials someone pasted in.
    return url.origin;
  } catch {
    return undefined;
  }
}
