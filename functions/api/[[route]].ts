/**
 * Cloudflare Pages Function entry point for the AlaveX accounts + cloud
 * device sync API.
 *
 * The `[[route]]` filename is Pages' catch-all convention: every request
 * under `/api/*` is routed to this file. Everything else (the built
 * website in `dist/`) is served as a static asset without running any
 * Function at all, and Pages checks Functions routes before falling
 * back to `public/_redirects`, so the SPA fallback there never shadows
 * this API.
 *
 * The actual API logic lives in `worker/index.ts` (a plain Hono app) so
 * it stays framework-agnostic and easy to test on its own. This file
 * only adapts that shared app to Pages Functions' handler shape via
 * Hono's official Cloudflare Pages adapter.
 */
import { handle } from "hono/cloudflare-pages";
import app from "../../worker/index";

export const onRequest = handle(app);
