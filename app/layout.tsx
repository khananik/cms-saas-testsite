import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "testsiteanik",
  description:
    "testsiteanik — an Optimizely CMS SaaS front end rendering Visual Builder experiences from Optimizely Graph.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
