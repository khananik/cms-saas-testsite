"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PreviewBridgeProps = {
  /** Validated https origin of the CMS, resolved server-side. Never a user value. */
  cmsHost: string;
  /** CSP nonce forwarded from the server (the x-nonce request header). */
  nonce?: string;
};

/**
 * Loads the Optimizely CMS communication injector so the SaaS edit view can
 * drive this page inside its preview iframe, and refreshes the route when the
 * CMS reports that content was saved.
 */
export default function PreviewBridge({ cmsHost, nonce }: PreviewBridgeProps) {
  const router = useRouter();

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // SECURITY CONTROL: the origin check is what makes this listener safe.
      // Any frame on the page can postMessage to us, so anything that does not
      // come from the configured CMS origin is dropped silently and without
      // inspecting its payload.
      if (event.origin !== cmsHost) return;

      const data: unknown = event.data;
      let name = "";
      if (typeof data === "string") {
        name = data;
      } else if (data && typeof data === "object") {
        const id = (data as { id?: unknown }).id;
        const type = (data as { type?: unknown }).type;
        if (typeof id === "string") name = id;
        else if (typeof type === "string") name = type;
      }

      const normalized = name.toLowerCase();
      if (
        normalized.includes("contentsaved") ||
        normalized.includes("content-saved") ||
        normalized.includes("optimizely")
      ) {
        router.refresh();
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cmsHost, router]);

  return (
    <Script
      id="optimizely-communicationinjector"
      src={`${cmsHost}/util/javascript/communicationinjector.js`}
      strategy="afterInteractive"
      nonce={nonce}
    />
  );
}
