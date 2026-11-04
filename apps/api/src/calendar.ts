import { buildIcs, type IcsEvent } from "@ffa/validators";
import type { Env } from "./env";
import { getEvent, listEvents } from "./services/events";
import { loadSettings } from "./services/settings";
import { makeDb } from "./store";

const text = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/plain;charset=utf-8", "cache-control": "no-store", ...extra } });

/**
 * Calendar files for visitors: /events.ics for every upcoming event, /events/<slug>.ics for one (EVT-4).
 * Like the rest of the public API, nothing is served until the site is published.
 */
export async function handleCalendar(env: Env, req: Request, url: URL): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return text("Method not allowed", 405);
  const db = makeDb(env.DB);
  if (!(await loadSettings(db)).siteLive) return text("Not found", 404);

  const base = env.WEB_ORIGIN;
  const toIcs = (e: { id: string; title: string; slug: string; description: string; venue: string; address: string; startsAt: Date; endsAt: Date; cancelled: boolean }): IcsEvent => ({
    uid: `${e.id}@forestfae.ca`,
    title: e.title,
    startsAt: e.startsAt.getTime(),
    endsAt: e.endsAt.getTime(),
    description: e.description,
    location: [e.venue, e.address].filter(Boolean).join(", "),
    url: `${base}/events/${e.slug}`,
    cancelled: e.cancelled,
  });
  const headers = { "content-type": "text/calendar;charset=utf-8", "cache-control": "public, max-age=300" };

  const single = /^\/events\/([a-z0-9-]+)\.ics$/.exec(url.pathname);
  if (single) {
    const e = await getEvent(db, single[1]!);
    if (!e || e.archived || e.status === "DRAFT") return text("Not found", 404);
    return new Response(buildIcs([toIcs({ ...e, cancelled: e.status === "CANCELLED" })]), { headers: { ...headers, "content-disposition": `attachment; filename="${e.slug}.ics"` } });
  }
  if (url.pathname === "/events.ics") {
    const upcoming = (await listEvents(db, { when: "upcoming" })).filter((e) => e.status !== "DRAFT");
    const full = (await Promise.all(upcoming.map((e) => getEvent(db, e.id)))).filter((e): e is NonNullable<typeof e> => e !== null);
    return new Response(buildIcs(full.map((e) => toIcs({ ...e, cancelled: e.status === "CANCELLED" }))), { headers });
  }
  return text("Not found", 404);
}
