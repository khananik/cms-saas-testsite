import "server-only";

/**
 * Optimizely Graph client. Server-only by construction: the single key and the
 * preview token never leave this module and are never placed in a URL, a thrown
 * message, or anything rendered.
 */

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}

type GraphQueryOptions = {
  query: string;
  variables?: Record<string, unknown>;
  /** Draft reads only. Sent as a Bearer token; never cached. */
  previewToken?: string;
  revalidate?: number | false;
};

type GraphEnv = {
  url: string;
  singleKey: string;
};

type GraphResponse<T> = {
  data?: T | null;
  errors?: unknown;
};

const REQUEST_TIMEOUT_MS = 10_000;

/** Env is read lazily so a missing var fails the request, not the build. */
function readEnv(): GraphEnv {
  const url = process.env.OPTIMIZELY_GRAPH_URL?.trim();
  const singleKey = process.env.OPTIMIZELY_GRAPH_SINGLE_KEY?.trim();
  if (!url || !singleKey) {
    throw new GraphError("Optimizely Graph is not configured");
  }
  return { url, singleKey };
}

export async function graphQuery<T>(opts: GraphQueryOptions): Promise<T> {
  const { query, variables, previewToken, revalidate } = opts;
  const { url, singleKey } = readEnv();

  const isPreview = typeof previewToken === "string" && previewToken.length > 0;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    // Draft content is read with the caller's short-lived preview token;
    // published content with the server-held single key.
    Authorization: isPreview ? `Bearer ${previewToken}` : `epi-single ${singleKey}`,
  };

  const init: RequestInit & { next?: { revalidate: number | false } } = {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: variables ?? {} }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (isPreview) {
    // Draft content must never be cached or revalidated.
    init.cache = "no-store";
  } else {
    init.next = { revalidate: revalidate ?? 60 };
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    console.error("[graph] request failed", cause);
    throw new GraphError("Could not reach Optimizely Graph");
  }

  if (!response.ok) {
    // Server-side only: the body may echo request detail, so it is never rethrown.
    const body = await response.text().catch(() => "<unreadable body>");
    console.error(`[graph] HTTP ${response.status} ${response.statusText}`, body);
    throw new GraphError("Optimizely Graph request failed");
  }

  let payload: GraphResponse<T>;
  try {
    payload = (await response.json()) as GraphResponse<T>;
  } catch (cause) {
    console.error("[graph] invalid JSON response", cause);
    throw new GraphError("Optimizely Graph returned an unreadable response");
  }

  if (payload.errors !== undefined && payload.errors !== null) {
    const hasErrors = Array.isArray(payload.errors) ? payload.errors.length > 0 : true;
    if (hasErrors) {
      console.error("[graph] GraphQL errors", JSON.stringify(payload.errors));
      throw new GraphError("Optimizely Graph returned an error");
    }
  }

  if (payload.data === undefined || payload.data === null) {
    console.error("[graph] response contained no data");
    throw new GraphError("Optimizely Graph returned no data");
  }

  return payload.data;
}
