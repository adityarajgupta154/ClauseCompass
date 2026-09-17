/**
 * The screens open to search engines: reachable without a session or a
 * sign-in, and worth a result of their own. Every other route is a step of
 * one reader's journey, so DocumentHead marks it noindex and the build's
 * sitemap (vite/site-metadata.ts) leaves it out. Plain data, imported by both.
 */
export const INDEXABLE_ROUTES: readonly string[] = ["/", "/help"];
