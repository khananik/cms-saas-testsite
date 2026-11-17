import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { headers } from "next/headers";

import SiteBannerBar from "@/components/site/SiteBannerBar";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { OPTIMIZELY_SNIPPET_SRC } from "@/lib/optimizely";
import { getSiteChrome } from "@/lib/queries";
import type { SiteChrome } from "@/lib/types";

import "./globals.css";
// Tailwind utilities for CMS-authored Raw HTML only — see app/cms-tailwind.css.
import "./cms-tailwind.css";

/**
 * Self-hosted at build time by next/font, so there is no Google Fonts request
 * at runtime: the CSP stays at style-src 'self' / font-src 'self' with no
 * third-party origin to allowlist, and no render-blocking external stylesheet.
 * The variable is consumed by --ob-font in globals.css.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--ob-font-inter",
});

export const metadata: Metadata = {
  title: "Mosey Bank",
  description: "Banking built around you.",
};

/**
 * Optimizely Web Experimentation snippet.
 *
 * Loaded exactly as Optimizely requires: a plain, SYNCHRONOUS <script src> in the
 * <head>, in the server response. It must block rendering so variations are
 * applied before first paint — loading it async, via next/script, or through a
 * tag manager causes a flash of original content.
 *
 * CSP: proxy.ts sends `script-src 'nonce-…' 'strict-dynamic'`. Under
 * 'strict-dynamic', CSP3 browsers IGNORE host allowlists, so allowing
 * cdn.optimizely.com would do nothing — the nonce is what authorises this tag,
 * and 'strict-dynamic' then extends that trust to the scripts it loads itself.
 * Its event endpoints (logx/rum/prediction.optimizely.com) are covered by
 * connect-src https:.
 *
 * The snippet also embeds an iframe from its project origin; frame-src allows
 * that exact origin (lib/optimizely.ts).
 *
 * 'unsafe-eval' is deliberately NOT in the CSP. A published snippet ships custom
 * code as real functions; the snippet's eval() path is for code delivered as a
 * STRING, which is how the Visual Editor previews unsaved custom-code changes.
 * If custom-code experiments misbehave in QA, look here first.
 */

const EMPTY_CHROME: SiteChrome = {
  navigation: null,
  footer: null,
  banner: null,
  settings: null,
};

/**
 * getSiteChrome() already swallows GraphError and degrades to an all-null
 * chrome, but it deliberately rethrows anything that is NOT a GraphError.
 * In a route that would surface app/error.tsx; thrown from the ROOT LAYOUT it
 * escapes the error boundary entirely and takes the whole site to
 * global-error. The chrome is decoration, so it is caught once more here and
 * the page renders bare rather than blank.
 */
async function loadChrome(): Promise<SiteChrome> {
  try {
    return await getSiteChrome();
  } catch (error) {
    console.error("[layout] site chrome unavailable", error);
    return EMPTY_CHROME;
  }
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const chrome = await loadChrome();
  // Per-request CSP nonce from proxy.ts. Without it the snippet is blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Synchronous by design — see OPTIMIZELY_SNIPPET_SRC above. Next's
            no-sync-scripts rule flags exactly the behaviour Optimizely needs. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src={OPTIMIZELY_SNIPPET_SRC} nonce={nonce} />
      </head>
      <body>
        {/* First focusable element on the page: hidden until focused. */}
        <a className="ob-skip-link" href="#main">
          Skip to content
        </a>
        <SiteBannerBar banner={chrome.banner} />
        <SiteHeader navigation={chrome.navigation} settings={chrome.settings} />
        <main id="main" className="ob-main">
          {children}
        </main>
        <SiteFooter footer={chrome.footer} settings={chrome.settings} />
      </body>
    </html>
  );
}
