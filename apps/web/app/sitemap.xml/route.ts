import { createApi } from "@/lib/api";
import { xml } from "@/lib/seo";
import { SITE_URL, mayIndex } from "@/lib/site-config";

const STATIC_PAGES = ["/", "/portfolio", "/events", "/about", "/contact", "/privacy", "/terms"];

/** Listed only once the site is published on the real domain (WEB-10, WEB-18). Before that there is nothing to submit. */
export async function GET() {
  const api = createApi();
  try {
    const [settings, map] = await Promise.all([api.settings.public.query(), api.site.sitemap.query()]);
    if (!mayIndex(settings.siteLive) || !map.live) return new Response("Not published.", { status: 404 });
    const urls = [
      ...STATIC_PAGES.map((p) => ({ loc: `${SITE_URL}${p === "/" ? "" : p}`, lastmod: null as string | null })),
      ...map.pieces.map((p) => ({ loc: `${SITE_URL}/portfolio/${p.slug}`, lastmod: new Date(p.updatedAt).toISOString() })),
      ...map.events.map((e) => ({ loc: `${SITE_URL}/events/${e.slug}`, lastmod: null })),
    ];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
      `\n</urlset>\n`;
    return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
  } catch {
    return new Response("Not available.", { status: 503 });
  }
}
