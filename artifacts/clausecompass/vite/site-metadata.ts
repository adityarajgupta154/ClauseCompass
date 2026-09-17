import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { en } from '../src/features/journey/copy.en';
import { INDEXABLE_ROUTES } from '../src/features/seo/routes';

/**
 * The parts of the page head and the crawl files that need the site's
 * public address: the canonical link, og:url and the social image, the
 * structured data, and the sitemap. A build learns the address from
 * VITE_SITE_URL (the environment or a .env file), or from the platform's
 * REPLIT_DOMAINS when it runs for a published app; without either (a local
 * build, the dev server, a preview behind a noindex proxy) every line that
 * would carry an address is left out rather than written with a wrong one,
 * and robots.txt names no sitemap. The address is checked before use: an
 * https: address (http: for a local host only) with no credentials, query or
 * fragment, or the build stops. The app's base path is appended, so a build
 * served below the root names its pages where they are.
 *
 * index.html keeps the welcome screen's title and description as plain
 * text, so that a crawler that runs no script reads them as written; the
 * plugin checks them against the copy table and fails the build if they
 * have drifted (DocumentHead writes the same sentences once the app runs).
 * The dev and preview servers, which is how the app is served when
 * published, give each indexable screen its own head (the helplines'
 * title, description and canonical, for a crawler or a link unfurler that
 * runs no script) and mark every other address noindex in a response
 * header, so the head's "index, follow" never reaches a crawler for a
 * screen of one reader's journey.
 */
const PLACEHOLDER = '__SITE_URL__/';

interface Site {
  /** The site's root page, base path included, with a trailing slash. */
  root: string;
  robots: string;
  sitemap: string | null;
}

export function siteMetadata(): Plugin {
  let site: Site;
  let base: string;

  return {
    name: 'clausecompass:site-metadata',
    configResolved(config) {
      base = config.base;
      site = resolveSite(config);
      config.logger.info(
        site.sitemap === null
          ? 'site-metadata: no site URL (set VITE_SITE_URL); canonical, og:url, structured data and the sitemap are left out'
          : `site-metadata: pages at ${site.root}`,
      );
    },
    transformIndexHtml(html, context) {
      checkStaticHead(html);
      // The head's comments are for whoever reads the source file, not for the browser.
      let output = html.replace(/^\s*<!--[\s\S]*?-->\n/gm, '');
      if (site.sitemap === null) {
        output = output.replace(new RegExp(`^.*${PLACEHOLDER}.*\\n`, 'gm'), '');
      } else {
        output = output
          .replaceAll(PLACEHOLDER, escapeHtml(site.root))
          .replace('  </head>', `    <script type="application/ld+json">${jsonForScript(structuredDataFor(site.root))}</script>\n  </head>`);
      }
      // The dev server serves the page for every address; the built file is one file, and the preview server picks the head per route.
      return context.server ? headForRoute(output, routeOf(context.originalUrl ?? '/', base), site.sitemap === null ? null : site.root) : output;
    },
    configureServer(server) {
      server.middlewares.use(crawlFiles(base, site));
      server.middlewares.use(robotsHeader(base));
    },
    configurePreviewServer(server) {
      // The built page, and the address the build wrote into it: the serving process may not have been given one.
      const indexPath = path.join(server.config.build.outDir, 'index.html');
      let built: { html: string; root: string | null } | null = null;
      server.middlewares.use(robotsHeader(base));
      server.middlewares.use((request, response, next) => {
        const route = routeOf(request.url ?? '/', base);
        if (route === '/' || !INDEXABLE_ROUTES.includes(route)) return next();
        if (built === null) {
          const html = readFileSync(indexPath, 'utf8');
          built = { html, root: html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null };
        }
        sendText(response, 'text/html; charset=utf-8', headForRoute(built.html, route, built.root));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: site.robots });
      if (site.sitemap !== null) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: site.sitemap });
    },
  };
}

function resolveSite(config: ResolvedConfig): Site {
  const env = loadEnv(config.mode, config.envDir, '');
  const address = resolveSiteUrl(env);
  if (address === null) return { root: '', robots: robotsFor(null), sitemap: null };
  const root = `${address}${config.base}`;
  return { root, robots: robotsFor(root), sitemap: sitemapFor(root) };
}

/** The address without a trailing slash, from the explicit variable first, then the platform's list of domains for a published app. */
function resolveSiteUrl(env: Record<string, string>): string | null {
  const explicit = env.VITE_SITE_URL?.trim();
  if (explicit) return checkedSiteUrl(explicit, 'VITE_SITE_URL');
  if (env.REPLIT_DEPLOYMENT === '1') {
    const domain = env.REPLIT_DOMAINS?.split(',')[0]?.trim();
    if (domain) return checkedSiteUrl(`https://${domain}`, 'REPLIT_DOMAINS');
  }
  return null;
}

/** A public https: address (http: for a local host only) and nothing else in it; anything else stops the build, since every page would name it. */
function checkedSiteUrl(value: string, source: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${source}: "${value}" is not an absolute address (expected https://example.org)`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`${source}: "${value}" must be an https: address`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${source}: "${value}" must carry no credentials, query or fragment`);
  const pathname = url.pathname.replace(/\/+$/, '');
  if (/[<>"'\s]/.test(pathname)) throw new Error(`${source}: "${value}" has characters that cannot appear in a page address`);
  return `${url.origin}${pathname}`;
}

function checkStaticHead(html: string) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (title !== welcomeTitle()) throw new Error(`index.html: the <title> is "${title}", the copy table says "${welcomeTitle()}"`);
  if (description !== en.product.description) throw new Error('index.html: the description differs from product.description in copy.en.ts');
}

/** The welcome screen's title: the name, then what the product is (DocumentHead builds the same). */
function welcomeTitle(): string {
  return `${en.product.name} | ${en.product.tagline.replace(/\.\s*$/, '')}`;
}

/**
 * The page's head for one indexable route other than the welcome: its own
 * title and description, in the title element, the description, the
 * social tags, and (given the site's root, which a build that knew the
 * address wrote into the page) the canonical link and og:url. The same
 * values DocumentHead writes once the app runs.
 */
function headForRoute(html: string, route: string, root: string | null): string {
  if (route === '/' || !INDEXABLE_ROUTES.includes(route)) return html;
  const title = `${en.resources.heading} | ${en.product.name}`;
  const description = en.resources.description;
  let output = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`);
  if (root !== null) {
    const address = `${root}${escapeHtml(route.slice(1))}`;
    output = output
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${address}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${address}$2`);
  }
  return output;
}

/** The app route for a request path: the path below the base, query dropped; a path outside the base is no route. */
function routeOf(url: string, base: string): string {
  const pathname = url.replace(/[?#].*$/, '');
  if (pathname === base.replace(/\/$/, '')) return '/';
  if (!pathname.startsWith(base)) return '';
  return `/${pathname.slice(base.length)}`;
}

/** robots.txt and sitemap.xml on the dev server, where the built assets do not exist. */
function crawlFiles(base: string, site: Site) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const route = routeOf(request.url ?? '/', base);
    if (route === '/robots.txt') return sendText(response, 'text/plain; charset=utf-8', site.robots);
    if (site.sitemap !== null && route === '/sitemap.xml') return sendText(response, 'application/xml; charset=utf-8', site.sitemap);
    next();
  };
}

/** Every page request for a screen that is not indexable answers with a noindex header, whatever the page's head says before the app runs. */
function robotsHeader(base: string) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const route = routeOf(request.url ?? '/', base);
    const page = route !== '' && !/\.[a-z0-9]+$/i.test(route) && (request.headers.accept ?? '').includes('text/html');
    if (page && !INDEXABLE_ROUTES.includes(route)) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  };
}

function robotsFor(root: string | null): string {
  return ['User-agent: *', 'Allow: /', ...(root === null ? [] : [`Sitemap: ${root}sitemap.xml`]), ''].join('\n');
}

function sitemapFor(root: string): string {
  const urls = INDEXABLE_ROUTES.map((route) => `  <url><loc>${escapeHtml(`${root}${route.slice(1)}`)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** What the product is, for a search engine: a site and the web application on it. Nothing it is not: no organisation, no rating, no price. */
function structuredDataFor(root: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${root}#website`,
        url: root,
        name: en.product.name,
        description: en.product.description,
        inLanguage: 'en-IN',
      },
      {
        '@type': 'WebApplication',
        '@id': `${root}#app`,
        url: root,
        name: en.product.name,
        description: en.product.description,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        inLanguage: 'en-IN',
        image: `${root}og-image.jpg`,
      },
    ],
  };
}

/** JSON inside a script element: a "<" in a value must not be read as a tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function sendText(response: ServerResponse, contentType: string, body: string) {
  response.setHeader('Content-Type', contentType);
  response.end(body);
}
