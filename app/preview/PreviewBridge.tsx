"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PreviewBridgeProps = {
  /** Validated https origin of the CMS, resolved server-side. Never a user value. */
  cmsHost: string;
  /** CSP nonce forwarded from the server (the x-nonce request header). */
  nonce?: string;
  /** The version currently being previewed, so a save to a NEW version can navigate. */
  version?: string;
};

/**
 * The CMS communication injector does not postMessage to the page: it dispatches a
 * DOM CustomEvent on `window`. This is the event name and payload it uses.
 */
const CONTENT_SAVED_EVENT = "optimizely:cms:contentSaved";

type ContentSavedDetail = {
  /** "<contentKey>_<version>" — the version is the part we care about. */
  contentLink?: unknown;
  previewUrl?: unknown;
  previewToken?: unknown;
};

/** Graph versions are short numeric/id strings; anything else is not navigated to. */
const VERSION_PATTERN = /^[A-Za-z0-9_.-]{1,50}$/;

/**
 * Pulls the version out of a contentLink, rejecting anything that does not look
 * like a version. The event detail is attacker-reachable in principle (any script
 * running on the page can dispatch a CustomEvent), so it is treated as untrusted
 * input: it is only ever used to set the `ver` query parameter, never as a URL.
 */
function versionFromContentLink(contentLink: unknown): string | undefined {
  if (typeof contentLink !== "string") return undefined;
  const parts = contentLink.split("_");
  const candidate = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (candidate === undefined) return undefined;
  return VERSION_PATTERN.test(candidate) ? candidate : undefined;
}

/**
 * Loads the Optimizely CMS communication injector so the SaaS edit view can drive
 * this page inside its preview iframe, and reacts when the CMS reports a save.
 *
 * Two channels are handled:
 *  - `optimizely:cms:contentSaved`, a CustomEvent the injector dispatches on window.
 *    This is the one the CMS actually uses.
 *  - `message`, kept as a defensive fallback and gated on the exact CMS origin.
 *
 * On save the editor usually creates a NEW draft version. Refreshing alone would
 * re-fetch the version in the current URL and show stale content, so when the event
 * carries a different version we navigate to the same preview URL with `ver` updated.
 */
export default function PreviewBridge({ cmsHost, nonce, version }: PreviewBridgeProps) {
  const router = useRouter();

  useEffect(() => {
    function goToSavedVersion(nextVersion: string | undefined): void {
      if (nextVersion !== undefined && nextVersion !== version) {
        // Rebuild from the live URL so key, loc, ctx and preview_token are preserved.
        const url = new URL(window.location.href);
        url.searchParams.set("ver", nextVersion);
        router.push(`${url.pathname}${url.search}`);
        return;
      }
      router.refresh();
    }

    function onContentSaved(event: Event): void {
      const detail = (event as CustomEvent<ContentSavedDetail>).detail;
      goToSavedVersion(versionFromContentLink(detail?.contentLink));
    }

    function onMessage(event: MessageEvent): void {
      // SECURITY CONTROL: for postMessage the origin check is what makes this safe.
      // Any frame can postMessage to us, so anything that is not exactly the
      // configured CMS origin is dropped without inspecting its payload.
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

      if (/contentsaved|content-saved/i.test(name)) {
        const link = (data as ContentSavedDetail | null)?.contentLink;
        goToSavedVersion(versionFromContentLink(link));
      }
    }

    window.addEventListener(CONTENT_SAVED_EVENT, onContentSaved);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(CONTENT_SAVED_EVENT, onContentSaved);
      window.removeEventListener("message", onMessage);
    };
  }, [cmsHost, router, version]);

  return (
    <Script
      id="optimizely-communicationinjector"
      src={`${cmsHost}/util/javascript/communicationinjector.js`}
      strategy="afterInteractive"
      nonce={nonce}
    />
  );
}
