/**
 * Fallback for a composition component whose content type has no registered
 * React component. In production it renders nothing, so an unmapped block can
 * never leak internals or break a page. In development it shows a small
 * diagnostic listing the content type names only — never the block's data.
 */
export type UnknownBlockProps = {
  types?: string[] | null;
};

export default function UnknownBlock({ types }: UnknownBlockProps) {
  if (process.env.NODE_ENV === "production") return null;

  const names = Array.isArray(types)
    ? types.filter((type): type is string => typeof type === "string" && type.length > 0)
    : [];

  return (
    <div
      style={{
        border: "1px dashed var(--ob-border)",
        borderRadius: "var(--ob-radius)",
        padding: "var(--ob-space-3)",
        margin: "var(--ob-space-2) 0",
        color: "var(--ob-muted)",
        font: "inherit",
        fontSize: "0.8125rem",
      }}
    >
      No component registered for {names.length > 0 ? names.join(" → ") : "this block"}
    </div>
  );
}
