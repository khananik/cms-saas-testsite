"use client";

import { useEffect } from "react";

/**
 * Generic error boundary.
 *
 * Security: `error.message` / `error.stack` are never rendered. Upstream failures
 * (Graph errors, bad configuration) can carry request detail, so only a fixed
 * sentence and the framework-generated `digest` correlation id are shown. The real
 * detail is logged server-side by lib/graph.ts and by the route handlers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only the opaque digest goes to the browser console — never the message.
    if (error.digest) {
      console.error("Render error, digest:", error.digest);
    }
  }, [error.digest]);

  return (
    <div className="ob-container" style={{ paddingBlock: "var(--ob-space-6)" }}>
      <h1>Something went wrong</h1>
      <p style={{ color: "var(--ob-muted)", marginTop: "var(--ob-space-3)" }}>
        We couldn&rsquo;t load this page right now. Please try again in a moment.
      </p>
      {error.digest ? (
        <p style={{ color: "var(--ob-muted)", marginTop: "var(--ob-space-2)" }}>
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <p style={{ marginTop: "var(--ob-space-4)" }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            background: "var(--ob-accent)",
            color: "var(--ob-accent-fg)",
            border: "none",
            borderRadius: "var(--ob-radius)",
            padding: "var(--ob-space-2) var(--ob-space-4)",
          }}
        >
          Try again
        </button>
      </p>
    </div>
  );
}
