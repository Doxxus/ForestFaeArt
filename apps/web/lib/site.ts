import { cache } from "react";
import { API_URL } from "./config";
import { getCurrentUser, serverApi } from "./session";

/**
 * What every public page needs to know first: the public settings, and whether this visitor may see the site.
 * While the site is unpublished, only signed-in staff can (WEB-18). Cached for one request.
 */
export const getSite = cache(async () => {
  const [settings, user] = await Promise.all([serverApi().then((api) => api.settings.public.query()), getCurrentUser()]);
  return { settings, user, open: settings.siteLive || user !== null, preview: !settings.siteLive && user !== null };
});

/** The shape of the public settings, as the API sends them. */
export type SiteSettings = Awaited<ReturnType<typeof getSite>>["settings"];

/** The widths the API will resize a photo to (anything else snaps to the nearest). */
export const PHOTO_WIDTHS = [320, 640, 960, 1280, 1920] as const;

export const imageSrc = (path: string, width: number) => `${API_URL}${path}?w=${width}`;

export const imageSrcSet = (path: string, widths: readonly number[] = PHOTO_WIDTHS) => widths.map((w) => `${imageSrc(path, w)} ${w}w`).join(", ");

/** Blank lines separate paragraphs. Plain text only, so nothing the owner types can become markup. */
export const paragraphs = (text: string) =>
  text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
