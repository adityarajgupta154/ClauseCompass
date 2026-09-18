import { useEffect } from "react";
import { useLocation } from "wouter";
import { copy } from "@/features/journey/copy";
import { INDEXABLE_ROUTES } from "@/features/seo/routes";
import { useSetScreenTitle } from "@/features/seo/screen-title";

/**
 * The page head, kept in step with the screen: the tab title (WCAG 2.4.2,
 * and what a search result or a bookmark shows), the description, whether
 * the screen may be indexed, and the canonical address. index.html carries
 * the welcome screen's values for crawlers that do not run scripts; this
 * component takes over once the app is running, and again on every route
 * or language change (JourneyRoutes re-renders it with the current copy).
 * A screen whose heading changes in place says so through `useScreenTitle`,
 * and its word stands over the route's while it does.
 */
export function DocumentHead() {
  const [location] = useLocation();
  const indexable = INDEXABLE_ROUTES.includes(location);
  const setByScreen = useSetScreenTitle();
  const screen = setByScreen ?? screenTitle(location);
  // The welcome screen: the name, then what the product is. Every other screen: its heading, then the name, so a row of tabs reads by screen.
  const title = screen === null ? `${copy.product.name} | ${withoutFullStop(copy.product.tagline)}` : `${screen} | ${copy.product.name}`;
  const description = location === "/help" ? copy.resources.description : copy.product.description;

  useEffect(() => {
    document.title = title;
    setMeta("description", description);
    setMeta("robots", indexable ? "index, follow" : "noindex, nofollow");
    setCanonical(indexable ? location : null);
  }, [title, description, indexable, location]);

  return null;
}

/** The screen's own heading, or null for the welcome screen, whose title is the product's. An unknown route is the not-found screen. */
function screenTitle(location: string): string | null {
  switch (location) {
    case "/":
      return null;
    case "/upload":
      return copy.upload.heading;
    case "/interview":
      return copy.interview.heading;
    case "/map":
      return copy.map.heading;
    case "/review":
      return copy.review.heading;
    case "/compare":
      return copy.compare.heading;
    case "/packet":
      return copy.packet.heading;
    case "/ask":
      return copy.ask.heading;
    case "/help":
      return copy.resources.heading;
    case "/safety":
      return copy.safety.heading;
    case "/sign-in":
      return copy.auth.signIn.modes.signIn.heading;
    default:
      return copy.notFoundPage.heading;
  }
}

/** The tagline is a sentence; a title is not. */
function withoutFullStop(sentence: string): string {
  return sentence.replace(/[.।]\s*$/u, "");
}

function setMeta(name: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta === null) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

/**
 * The site's root page (base path included, trailing slash), known only to
 * a build that had the address: vite/site-metadata.ts writes it into the
 * canonical link then, for the welcome screen, and the served page for the
 * helplines names that screen's own address. Remembered from the first
 * link seen, so the link can be dropped on a screen that must not be
 * indexed and put back, with the screen's own path, on one that may. The
 * root is the link's address up to its last slash, which holds because
 * every indexable route is one segment deep (features/seo/routes.ts).
 */
let siteRoot: string | null = null;

function setCanonical(path: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (siteRoot === null && existing !== null) siteRoot = existing.href.replace(/[^/]*$/, "");
  if (siteRoot === null) return;
  if (path === null) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.createElement("link");
  link.rel = "canonical";
  link.href = `${siteRoot}${path.slice(1)}`;
  if (existing === null) document.head.append(link);
}
