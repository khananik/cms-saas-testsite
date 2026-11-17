/**
 * Optimizely Web Experimentation — the one place the project ID lives.
 *
 * Both the snippet tag (app/layout.tsx) and the Content-Security-Policy (proxy.ts)
 * derive from this, so changing the project cannot leave the CSP allowing the old
 * project's origin while the page loads the new one.
 *
 * Kept free of imports and server-only APIs so proxy.ts can use it too.
 */

const PROJECT_ID = "4871554132082688";

/** The snippet. Loaded synchronously in <head> — see app/layout.tsx for why. */
export const OPTIMIZELY_SNIPPET_SRC = `https://cdn.optimizely.com/js/${PROJECT_ID}.js`;

/**
 * The project-specific origin the snippet embeds an iframe from (observed in the
 * browser: blocked by frame-src until allowed). It must be listed in frame-src.
 * Deliberately the exact project origin, not *.optimizely.com.
 */
export const OPTIMIZELY_FRAME_ORIGIN = `https://a${PROJECT_ID}.cdn.optimizely.com`;
