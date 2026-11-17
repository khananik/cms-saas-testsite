import Link from "next/link";

export default function NotFound() {
  return (
    <div className="ob-container" style={{ paddingBlock: "var(--ob-space-6)" }}>
      <h1>Page not found</h1>
      <p style={{ color: "var(--ob-muted)", marginTop: "var(--ob-space-3)" }}>
        We couldn&rsquo;t find the page you were looking for. It may have been moved or
        unpublished.
      </p>
      <p style={{ marginTop: "var(--ob-space-4)" }}>
        <Link href="/">Back to the home page</Link>
      </p>
    </div>
  );
}
