import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import SiteBannerBar from "@/components/site/SiteBannerBar";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
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

  return (
    <html lang="en" className={inter.variable}>
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
