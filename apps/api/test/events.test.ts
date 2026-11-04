import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { sql, users } from "@ffa/db";
import { localToUtcMs } from "@ffa/validators";
import type { Env } from "../src/env";
import worker from "../src/index";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
import { makeDb, type Db } from "../src/store";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
let env: Env;
let adminToken: string;
let admin: ReturnType<typeof as>;
let staff: ReturnType<typeof as>;

function as(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers })));
}
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error;
    throw error;
  }
  throw new Error("Expected the call to be rejected");
};

const TZ = "America/Toronto";
const at = (s: string) => localToUtcMs(s, TZ)!;
const DAY = 24 * 3600_000;

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "https://web.test" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "A", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "S", role: "STAFF", passwordHash: hash },
  ]);
  const login = async (email: string) => (await as().auth.login({ email, password: "correct horse battery staple" })).token;
  adminToken = await login("a@example.com");
  admin = as(adminToken);
  staff = as(await login("s@example.com"));
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

const future = () => ({ startsAt: Date.now() + 30 * DAY, endsAt: Date.now() + 31 * DAY });
const newEvent = (title: string, extra: Record<string, unknown> = {}) => admin.events.create({ title, ...future(), ...extra } as Parameters<typeof admin.events.create>[0]);
async function piece(title: string, status: "AVAILABLE" | "RESERVED" | "DRAFT" = "AVAILABLE", quantity = 1) {
  const p = await admin.products.create({ title, priceCents: 1000, quantity });
  if (status !== "DRAFT") await admin.products.changeStatus({ productId: p.id, to: "AVAILABLE" });
  if (status === "RESERVED") await admin.products.changeStatus({ productId: p.id, to: "RESERVED", reason: "held" });
  return p;
}
const statusOf = async (id: string) => (await admin.products.list({ q: "", limit: 100, includeArchived: true })).items.find((i) => i.id === id)?.status;

describe("creating and editing events", () => {
  it("creates a draft with a unique slug and a default time zone", async () => {
    const a = await newEvent("Winter Market");
    const b = await newEvent("Winter Market");
    expect([a.slug, b.slug]).toEqual(["winter-market", "winter-market-2"]);
    const e = await admin.events.get({ idOrSlug: a.slug });
    expect(e).toMatchObject({ title: "Winter Market", status: "DRAFT", timezone: "America/Toronto", archived: false, pieces: [] });
  });

  it("validates dates, time zone, website and hours", async () => {
    const bad = (extra: Record<string, unknown>) => rejection(newEvent("Bad", extra));
    expect((await bad({ startsAt: Date.now() + DAY, endsAt: Date.now() })).message).toMatch(/before it starts/);
    expect((await bad({ timezone: "Mars/Base" })).message).toMatch(/time zone/);
    expect((await bad({ websiteUrl: "javascript:alert(1)" })).message).toMatch(/https/);
    expect((await bad({ hours: [{ date: "2026-12-05", open: "17:00", close: "10:00" }] })).message).toMatch(/closing time/);
    expect((await bad({ hours: [{ date: "2026-12-05", open: "10:00", close: null }] })).message).toMatch(/both/);
  });

  it("keeps editing to administrators, STAFF can only look", async () => {
    const e = await newEvent("Staff test");
    expect((await rejection(staff.events.create({ title: "x", ...future() } as Parameters<typeof admin.events.create>[0]))).code).toBe("FORBIDDEN");
    expect((await rejection(staff.events.update({ id: e.id, title: "y" }))).code).toBe("FORBIDDEN");
    expect((await rejection(staff.events.duplicate({ id: e.id }))).code).toBe("FORBIDDEN");
    expect((await staff.events.get({ idOrSlug: e.slug })).title).toBe("Staff test");
    expect((await staff.events.list()).some((x) => x.id === e.id)).toBe(true);
  });

  it("updates details, hours and status, and audits", async () => {
    const e = await newEvent("Spring Fair");
    await admin.events.update({
      id: e.id,
      venue: "Market Hall",
      address: "1 Main St, Stratford ON",
      startsAt: at("2027-04-10T09:00"),
      endsAt: at("2027-04-11T17:00"),
      hours: [{ date: "2027-04-10", open: "09:00", close: "17:00" }, { date: "2027-04-11", open: null, close: null }],
      status: "PUBLISHED",
    });
    const got = await admin.events.get({ idOrSlug: e.id });
    expect(got).toMatchObject({ venue: "Market Hall", status: "PUBLISHED", days: ["2027-04-10", "2027-04-11"] });
    expect(got.hours).toHaveLength(2);
    expect(got.mapUrl).toContain("google.com/maps");
    expect((await rejection(admin.events.update({ id: e.id, endsAt: at("2027-04-01T09:00") }))).message).toMatch(/before it starts/);
    const audit = await db.all<{ action: string }>(sql`SELECT action FROM audit_log WHERE entity_id = ${e.id}`);
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["event.create", "event.update"]));
  });

  it("duplicates into a fresh draft without products", async () => {
    const e = await newEvent("Repeat Market", { venue: "Hall", status: "PUBLISHED" });
    const p = await piece("Dup piece");
    await admin.events.assign({ eventId: e.id, productIds: [p.id] });
    const copy = await admin.events.duplicate({ id: e.id });
    const got = await admin.events.get({ idOrSlug: copy.id });
    expect(got).toMatchObject({ title: "Repeat Market (copy)", venue: "Hall", status: "DRAFT", pieces: [] });
  });

  it("archives and restores, hiding archived events from the default list", async () => {
    const e = await newEvent("Archive me");
    await admin.events.setArchived({ id: e.id, archived: true });
    expect((await admin.events.list()).some((x) => x.id === e.id)).toBe(false);
    expect((await admin.events.list({ includeArchived: true, when: "all" })).find((x) => x.id === e.id)?.archived).toBe(true);
    await admin.events.setArchived({ id: e.id, archived: false });
    expect((await admin.events.list()).some((x) => x.id === e.id)).toBe(true);
  });

  it("splits upcoming and past events", async () => {
    const past = await admin.events.create({ title: "Old Fair", startsAt: Date.now() - 20 * DAY, endsAt: Date.now() - 19 * DAY } as Parameters<typeof admin.events.create>[0]);
    const upcoming = (await admin.events.list({ when: "upcoming", includeArchived: false })).map((e) => e.id);
    const earlier = (await admin.events.list({ when: "past", includeArchived: false })).map((e) => e.id);
    expect(earlier).toContain(past.id);
    expect(upcoming).not.toContain(past.id);
  });
});

describe("taking pieces to an event", () => {
  it("moves pieces to AT_EVENT with a ledger entry that names the event, and skips ones that can't go", async () => {
    const e = await newEvent("Craft Fair");
    const a = await piece("Piece A");
    const b = await piece("Piece B", "RESERVED");
    const draft = await piece("Draft piece", "DRAFT");
    const r = await staff.events.assign({ eventId: e.id, productIds: [a.id, b.id, draft.id, a.id] });
    expect(r.assigned).toBe(2);
    expect(r.skipped).toEqual([{ sku: draft.sku, title: "Draft piece", reason: "still a draft" }]);
    expect(await statusOf(a.id)).toBe("AT_EVENT");
    expect(await statusOf(b.id)).toBe("AT_EVENT");
    expect((await admin.events.get({ idOrSlug: e.id })).pieces.map((p) => [p.sku, p.status, p.releasedAt])).toEqual([[a.sku, "AT_EVENT", null], [b.sku, "AT_EVENT", null]]);

    const history = await admin.products.history({ productId: a.id });
    expect(history[0]).toMatchObject({ fromStatus: "AVAILABLE", toStatus: "AT_EVENT", notes: "Taken to event", user: "S" });
    const tx = await db.all<{ event_id: string }>(sql`SELECT event_id FROM inventory_transaction WHERE product_id = ${a.id} AND to_status = 'AT_EVENT'`);
    expect(tx[0]?.event_id).toBe(e.id);

    const again = await admin.events.assign({ eventId: e.id, productIds: [a.id] });
    expect(again).toMatchObject({ assigned: 0, skipped: [{ reason: "already at an event" }] });
  });

  it("refuses cancelled and archived events and unknown pieces", async () => {
    const p = await piece("Refuse piece");
    const cancelled = await newEvent("Cancelled Fair", { status: "CANCELLED" });
    expect((await rejection(staff.events.assign({ eventId: cancelled.id, productIds: [p.id] }))).message).toMatch(/cancelled/);
    const archived = await newEvent("Gone Fair");
    await admin.events.setArchived({ id: archived.id, archived: true });
    expect((await rejection(staff.events.assign({ eventId: archived.id, productIds: [p.id] }))).message).toMatch(/archived/);
    const e = await newEvent("Real Fair");
    expect((await rejection(staff.events.assign({ eventId: e.id, productIds: ["nope"] }))).code).toBe("NOT_FOUND");
    expect((await rejection(staff.events.assign({ eventId: "nope", productIds: [p.id] }))).code).toBe("NOT_FOUND");
    expect(await statusOf(p.id)).toBe("AVAILABLE");
  });

  it("lists only pieces that could go", async () => {
    const free = await piece("Findable zzq");
    const e = await newEvent("Finder Fair");
    const taken = await piece("Taken zzq");
    await staff.events.assign({ eventId: e.id, productIds: [taken.id] });
    const found = await staff.events.assignablePieces({ q: "zzq" });
    expect(found.map((p) => p.id)).toEqual([free.id]);
  });

  it("lets one of two simultaneous assignments of the same piece win", async () => {
    const e1 = await newEvent("Race A");
    const e2 = await newEvent("Race B");
    const p = await piece("Contested piece");
    const results = await Promise.allSettled([staff.events.assign({ eventId: e1.id, productIds: [p.id] }), staff.events.assign({ eventId: e2.id, productIds: [p.id] })]);
    const assigned = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.assigned] : [0]));
    expect(assigned.reduce((a, b) => a + b, 0)).toBe(1);
    const links = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM event_product WHERE product_id = ${p.id}`);
    expect(links[0]?.n).toBe(1);
  });

  it("brings a piece back to what it was before", async () => {
    const e = await newEvent("Return Fair");
    const a = await piece("Return A");
    const b = await piece("Return B", "RESERVED");
    await staff.events.assign({ eventId: e.id, productIds: [a.id, b.id] });
    expect(await staff.events.unassign({ eventId: e.id, productIds: [a.id, b.id] })).toEqual({ returned: 2 });
    expect(await statusOf(a.id)).toBe("AVAILABLE");
    expect(await statusOf(b.id)).toBe("RESERVED");
    expect((await admin.events.get({ idOrSlug: e.id })).pieces.every((p) => p.releasedAt !== null)).toBe(true);
    expect((await rejection(staff.events.unassign({ eventId: e.id, productIds: [a.id] }))).code).toBe("NOT_FOUND");
  });
});

describe("wrapping up an event", () => {
  it("shows what will happen, returns unsold pieces and leaves sold ones alone", async () => {
    const e = await newEvent("Wrap Fair");
    const unsold = await piece("Unsold piece");
    const sold = await piece("Sold at event");
    const reserved = await piece("Reserved piece", "RESERVED");
    await staff.events.assign({ eventId: e.id, productIds: [unsold.id, sold.id, reserved.id] });
    await staff.products.changeStatus({ productId: sold.id, to: "SOLD" });

    const preview = await staff.events.wrapUpPreview({ eventId: e.id });
    expect(preview.unsold.map((p) => [p.title, p.returnsTo]).sort()).toEqual([["Reserved piece", "RESERVED"], ["Unsold piece", "AVAILABLE"]]);
    expect(preview.other.map((p) => [p.title, p.status])).toEqual([["Sold at event", "SOLD"]]);
    expect(await statusOf(unsold.id)).toBe("AT_EVENT"); // preview changes nothing

    expect(await staff.events.wrapUp({ eventId: e.id })).toEqual({ returned: 2, alreadyGone: 1 });
    expect(await statusOf(unsold.id)).toBe("AVAILABLE");
    expect(await statusOf(reserved.id)).toBe("RESERVED");
    expect(await statusOf(sold.id)).toBe("SOLD");
    expect((await staff.events.wrapUpPreview({ eventId: e.id }))).toEqual({ unsold: [], other: [] });
    expect((await admin.products.history({ productId: unsold.id }))[0]).toMatchObject({ toStatus: "AVAILABLE", notes: "Event wrapped up" });
    // Wrapping up twice does nothing.
    expect(await staff.events.wrapUp({ eventId: e.id })).toEqual({ returned: 0, alreadyGone: 0 });
    expect((await rejection(staff.events.wrapUp({ eventId: "nope" }))).code).toBe("NOT_FOUND");
  });

  it("makes a piece assignable to the next event after it returns", async () => {
    const e1 = await newEvent("First Fair");
    const e2 = await newEvent("Second Fair");
    const p = await piece("Travelling piece");
    await staff.events.assign({ eventId: e1.id, productIds: [p.id] });
    await staff.events.wrapUp({ eventId: e1.id });
    expect((await staff.events.assign({ eventId: e2.id, productIds: [p.id] })).assigned).toBe(1);
  });
});

describe("the public events page", () => {
  it("shows nothing before the site is published, then only published and cancelled events", async () => {
    const pub = await newEvent("Public Market", { status: "PUBLISHED", venue: "Hall", address: "1 Main St", notes: "private note" });
    await newEvent("Secret Draft");
    expect(await as().events.publicList({})).toEqual([]);
    expect((await rejection(as().events.publicGet({ slug: pub.slug }))).code).toBe("NOT_FOUND");
    expect((await as(adminToken).events.publicList({})).map((e) => e.slug)).toContain(pub.slug); // signed-in preview

    await admin.settings.update({ siteLive: true });
    const list = await as().events.publicList({});
    expect(list.map((e) => e.slug)).toContain(pub.slug);
    expect(list.some((e) => e.title === "Secret Draft")).toBe(false);
    const one = await as().events.publicGet({ slug: pub.slug });
    expect(one).toMatchObject({ title: "Public Market", venue: "Hall", cancelled: false });
    expect(JSON.stringify(one)).not.toMatch(/private note|notes/);
    const cancelled = await newEvent("Called Off", { status: "CANCELLED" });
    expect((await as().events.publicGet({ slug: cancelled.slug })).cancelled).toBe(true);
    const draft = (await admin.events.list()).find((e) => e.title === "Secret Draft")!;
    expect((await rejection(as().events.publicGet({ slug: draft.slug }))).code).toBe("NOT_FOUND");
  });
});

describe("calendar files and event pictures", () => {
  const get = (path: string) => worker.fetch(new Request(`https://api.test${path}`), env);

  it("serves one event and all upcoming events as .ics, but not drafts", async () => {
    await admin.settings.update({ siteLive: true });
    const e = await newEvent("Calendar Market", { status: "PUBLISHED", venue: "Hall, East Wing", description: "Come by" });
    const res = await get(`/events/${e.slug}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("SUMMARY:Calendar Market");
    expect(body).toContain("LOCATION:Hall\\, East Wing");
    expect(body).toContain(`URL:https://web.test/events/${e.slug}`);
    expect(body).toContain("STATUS:CONFIRMED");

    const all = await (await get("/events.ics")).text();
    expect(all).toContain("SUMMARY:Calendar Market");
    expect(all).not.toContain("Secret Draft");

    const draft = await newEvent("Draft Calendar");
    expect((await get(`/events/${draft.slug}.ics`)).status).toBe(404);
    expect((await get("/events/nope.ics")).status).toBe(404);
  });

  it("does not serve calendars before the site is published", async () => {
    await admin.settings.update({ siteLive: false });
    const e = await newEvent("Hidden Calendar", { status: "PUBLISHED" });
    expect((await get(`/events/${e.slug}.ics`)).status).toBe(404);
    expect((await get("/events.ics")).status).toBe(404);
    await admin.settings.update({ siteLive: true });
  });

  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type: string, data: number[]) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const png = (w: number, h: number) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [...u32(w), ...u32(h), 8, 6, 0, 0, 0]), ...chunk("IDAT", [1, 2]), ...chunk("IEND", [])]);
  const upload = (eventId: string, token: string | null, body: Uint8Array) => {
    const headers = new Headers({ "content-type": "image/png" });
    if (token) headers.set("authorization", `Bearer ${token}`);
    return worker.fetch(new Request(`https://api.test/media/upload?eventId=${eventId}`, { method: "POST", headers, body }), env);
  };

  it("replaces an event's picture and removes the old file, for administrators only", async () => {
    const e = await newEvent("Picture Fair");
    const staffToken = (await as().auth.login({ email: "s@example.com", password: "correct horse battery staple" })).token;
    expect((await upload(e.id, staffToken, png(10, 10))).status).toBe(403);
    expect((await upload(e.id, null, png(10, 10))).status).toBe(401);
    expect((await upload("nope", adminToken, png(10, 10))).status).toBe(404);
    expect((await upload(e.id, adminToken, new TextEncoder().encode("<svg/>"))).status).toBe(400);

    const first = ((await (await upload(e.id, adminToken, png(30, 20))).json()) as { image: { path: string } }).image.path;
    expect(first).toMatch(new RegExp(`^/media/events/${e.id}/[0-9A-Z]{26}\\.png$`));
    expect((await admin.events.get({ idOrSlug: e.id })).imagePath).toBe(first);
    expect((await get(first)).status).toBe(200);

    const second = ((await (await upload(e.id, adminToken, png(40, 40))).json()) as { image: { path: string } }).image.path;
    expect(second).not.toBe(first);
    expect(await tdb.r2.get(first.replace("/media/", ""))).toBeNull();

    await admin.events.removeImage({ id: e.id });
    expect((await admin.events.get({ idOrSlug: e.id })).imagePath).toBeNull();
    expect(await tdb.r2.get(second.replace("/media/", ""))).toBeNull();
  });
});
