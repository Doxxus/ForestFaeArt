/** Serves product photos from R2, resized on demand by the Cloudflare Images binding when it is available. */

import type { Env } from "../env";
import { IMMUTABLE_CACHE } from "../services/images";

/** Only these widths are offered, so a caller cannot create endless unique (billable) transformations. */
export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const;
const KEY = /^(?:products|events|content)\/[0-9A-Z]{26}\/[0-9A-Z]{26}\.(?:jpg|png|webp)$/;

/** The smallest offered width that is at least `requested`, or null if the value is not a positive whole number. */
export function snapWidth(requested: string | null): number | null {
  if (requested === null) return null;
  const n = Number(requested);
  if (!Number.isInteger(n) || n < 1) return null;
  return VARIANT_WIDTHS.find((w) => w >= n) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]!;
}

type OutputFormat = "image/avif" | "image/webp" | "image/jpeg" | "image/png";

export function pickFormat(accept: string, original: string): OutputFormat {
  if (/image\/avif/.test(accept)) return "image/avif";
  if (/image\/webp/.test(accept)) return "image/webp";
  return original === "image/png" ? "image/png" : "image/jpeg";
}

const baseHeaders = (contentType: string, etag?: string) => {
  const h = new Headers({
    "content-type": contentType,
    "cache-control": IMMUTABLE_CACHE,
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "cross-origin",
    vary: "Accept",
  });
  if (etag) h.set("etag", etag);
  return h;
};

export async function serveMedia(env: Env, req: Request, url: URL): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const key = decodeURIComponent(url.pathname.slice("/media/".length));
  if (!KEY.test(key)) return new Response("Not found", { status: 404 });

  const rawWidth = url.searchParams.get("w");
  const width = snapWidth(rawWidth);
  if (rawWidth !== null && width === null) return new Response("Bad width", { status: 400 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const original = object.httpMetadata?.contentType ?? "application/octet-stream";

  if (width !== null && env.IMAGES) {
    try {
      const format = pickFormat(req.headers.get("accept") ?? "", original);
      const result = await env.IMAGES.input(object.body).transform({ width, fit: "scale-down" }).output({ format, quality: 82 });
      return result.response({ headers: baseHeaders(result.contentType()) });
    } catch (error) {
      // Fall back to the original rather than a broken image.
      console.error(JSON.stringify({ event: "image-transform-failed", key, message: String(error) }));
      const again = await env.MEDIA.get(key);
      if (!again) return new Response("Not found", { status: 404 });
      return new Response(req.method === "HEAD" ? null : again.body, { headers: baseHeaders(original, again.httpEtag) });
    }
  }
  return new Response(req.method === "HEAD" ? null : object.body, { headers: baseHeaders(original, object.httpEtag) });
}
