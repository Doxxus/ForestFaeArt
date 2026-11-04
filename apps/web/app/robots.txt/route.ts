import { createApi } from "@/lib/api";
import { SITE_URL, mayIndex } from "@/lib/site-config";

const CLOSED = "User-agent: *\nDisallow: /\n";

/**
 * Search engines are welcome only on the real site, and only after the owner publishes (WEB-18).
 * Staging never sets VITE_INDEXABLE, so it stays closed even when its site is switched live for testing.
 * Any doubt (the API is unreachable) means closed.
 */
export async function GET() {
  let body = CLOSED;
  try {
    const settings = await createApi().settings.public.query();
    if (mayIndex(settings.siteLive)) body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nDisallow: /set-password\nDisallow: /p/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  } catch {
    body = CLOSED;
  }
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
