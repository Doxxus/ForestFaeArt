import { and, asc, desc, eq, eventProducts, events, gte, inArray, isNull, lt, products, sql } from "@ffa/db";
import {
  eventDays,
  newId,
  parseHours,
  parseStoredHours,
  slugify,
  uniqueSlug,
  isValidTimeZone,
  type DayHours,
  type EventStatus,
  type ProductStatus,
} from "@ffa/validators";
import { auditStatement } from "./audit";
import { moveProducts, type Actor, type InventoryError } from "./inventory";
import { mediaPath, removeImageFile, storeSingleImage, type ImageError } from "./images";
import type { Db } from "../store";

export type EventError = { ok: false; code: "NOT_FOUND" | "INVALID" | "CONFLICT"; message: string };
const fail = (code: EventError["code"], message: string): EventError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

export interface EventInput {
  title: string;
  description?: string;
  websiteUrl?: string | null;
  venue?: string;
  address?: string;
  startsAt: number;
  endsAt: number;
  timezone?: string;
  hours?: DayHours[];
  notes?: string;
  status?: EventStatus;
}

function validate(input: Partial<EventInput>, current?: { startsAt: number; endsAt: number }): string | null {
  if (input.title !== undefined && !input.title.trim()) return "An event needs a title.";
  if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) return "That time zone isn't recognised.";
  if (input.websiteUrl && !/^https?:\/\/\S+$/i.test(input.websiteUrl)) return "The website address should start with https://";
  const starts = input.startsAt ?? current?.startsAt;
  const ends = input.endsAt ?? current?.endsAt;
  if (starts !== undefined && ends !== undefined && ends < starts) return "The event can't end before it starts.";
  if (input.hours) {
    const parsed = parseHours(input.hours);
    if (!parsed.ok) return parsed.message;
  }
  return null;
}

export async function createEvent(db: Db, actorId: string, input: EventInput): Promise<{ ok: true; id: string; slug: string } | EventError> {
  const problem = validate(input);
  if (problem) return fail("INVALID", problem);
  const slug = await uniqueSlug(slugify(input.title), async (s) => Boolean(await db.select({ id: events.id }).from(events).where(eq(events.slug, s)).get()));
  const id = newId();
  await runBatch(db, [
    db.insert(events).values({
      id,
      title: input.title.trim(),
      slug,
      description: input.description ?? "",
      websiteUrl: input.websiteUrl || null,
      venue: input.venue?.trim() ?? "",
      address: input.address?.trim() ?? "",
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      hours: JSON.stringify(input.hours ?? []),
      notes: input.notes ?? "",
      status: input.status ?? "DRAFT",
    }),
    auditStatement(db, { userId: actorId, action: "event.create", entityType: "event", entityId: id, diff: { title: input.title.trim() } }),
  ]);
  return { ok: true, id, slug };
}

export async function updateEvent(db: Db, actorId: string, id: string, patch: Partial<EventInput>): Promise<{ ok: true } | EventError> {
  const current = await db.select().from(events).where(eq(events.id, id)).get();
  if (!current) return fail("NOT_FOUND", "That event doesn't exist.");
  const problem = validate(patch, { startsAt: current.startsAt.getTime(), endsAt: current.endsAt.getTime() });
  if (problem) return fail("INVALID", problem);
  await runBatch(db, [
    db
      .update(events)
      .set({
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl || null } : {}),
        ...(patch.venue !== undefined ? { venue: patch.venue.trim() } : {}),
        ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
        ...(patch.startsAt !== undefined ? { startsAt: new Date(patch.startsAt) } : {}),
        ...(patch.endsAt !== undefined ? { endsAt: new Date(patch.endsAt) } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.hours !== undefined ? { hours: JSON.stringify(patch.hours) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(eq(events.id, id)),
    auditStatement(db, { userId: actorId, action: "event.update", entityType: "event", entityId: id, diff: patch as Record<string, unknown> }),
  ]);
  return { ok: true };
}

/** A new draft with the same details and no products, ready for the next market (EVT-2). */
export async function duplicateEvent(db: Db, actorId: string, id: string): Promise<{ ok: true; id: string; slug: string } | EventError> {
  const e = await db.select().from(events).where(eq(events.id, id)).get();
  if (!e) return fail("NOT_FOUND", "That event doesn't exist.");
  return createEvent(db, actorId, {
    title: `${e.title} (copy)`,
    description: e.description,
    websiteUrl: e.websiteUrl,
    venue: e.venue,
    address: e.address,
    startsAt: e.startsAt.getTime(),
    endsAt: e.endsAt.getTime(),
    timezone: e.timezone,
    hours: [],
    notes: e.notes,
    status: "DRAFT",
  });
}

export async function setEventArchived(db: Db, actorId: string, id: string, archived: boolean): Promise<{ ok: true } | EventError> {
  const e = await db.select({ id: events.id }).from(events).where(eq(events.id, id)).get();
  if (!e) return fail("NOT_FOUND", "That event doesn't exist.");
  await runBatch(db, [
    db.update(events).set({ archivedAt: archived ? new Date() : null }).where(eq(events.id, id)),
    auditStatement(db, { userId: actorId, action: archived ? "event.archive" : "event.restore", entityType: "event", entityId: id }),
  ]);
  return { ok: true };
}

export async function setEventImage(
  db: Db,
  bucket: R2Bucket,
  actorId: string,
  id: string,
  bytes: Uint8Array,
): Promise<{ ok: true; path: string } | EventError | ImageError> {
  const e = await db.select({ imageKey: events.imageKey }).from(events).where(eq(events.id, id)).get();
  if (!e) return fail("NOT_FOUND", "That event doesn't exist.");
  const stored = await storeSingleImage(bucket, "events", id, bytes);
  if (!stored.ok) return stored;
  await runBatch(db, [
    db.update(events).set({ imageKey: stored.key }).where(eq(events.id, id)),
    auditStatement(db, { userId: actorId, action: "event.image", entityType: "event", entityId: id }),
  ]);
  await removeImageFile(bucket, e.imageKey);
  return { ok: true, path: mediaPath(stored.key) };
}

export async function removeEventImage(db: Db, bucket: R2Bucket, actorId: string, id: string): Promise<{ ok: true } | EventError> {
  const e = await db.select({ imageKey: events.imageKey }).from(events).where(eq(events.id, id)).get();
  if (!e) return fail("NOT_FOUND", "That event doesn't exist.");
  await runBatch(db, [
    db.update(events).set({ imageKey: null }).where(eq(events.id, id)),
    auditStatement(db, { userId: actorId, action: "event.image.remove", entityType: "event", entityId: id }),
  ]);
  await removeImageFile(bucket, e.imageKey);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface EventSummary {
  id: string;
  title: string;
  slug: string;
  venue: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  status: EventStatus;
  archived: boolean;
  imagePath: string | null;
  /** Pieces currently taken to the event. */
  productCount: number;
  isSample: boolean;
}

export type EventWhen = "upcoming" | "past" | "all";

const countAtEvent = sql<number>`(SELECT COUNT(*) FROM event_product ep WHERE ep.event_id = event.id AND ep.released_at IS NULL)`;

export async function listEvents(db: Db, opts: { when?: EventWhen; includeArchived?: boolean; now?: number } = {}): Promise<EventSummary[]> {
  const now = new Date(opts.now ?? Date.now());
  const rows = await db
    .select({ event: events, productCount: countAtEvent })
    .from(events)
    .where(
      and(
        opts.includeArchived ? undefined : isNull(events.archivedAt),
        opts.when === "upcoming" ? gte(events.endsAt, now) : opts.when === "past" ? lt(events.endsAt, now) : undefined,
      ),
    )
    .orderBy(opts.when === "past" ? desc(events.startsAt) : asc(events.startsAt))
    .all();
  return rows.map(({ event: e, productCount }) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    venue: e.venue,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    status: e.status,
    archived: e.archivedAt !== null,
    imagePath: e.imageKey ? mediaPath(e.imageKey) : null,
    productCount,
    isSample: e.isSample,
  }));
}

export async function getEvent(db: Db, idOrSlug: string) {
  const e = await db
    .select()
    .from(events)
    .where(sql`${events.id} = ${idOrSlug} OR ${events.slug} = ${idOrSlug}`)
    .get();
  if (!e) return null;
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    websiteUrl: e.websiteUrl,
    venue: e.venue,
    address: e.address,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    hours: parseStoredHours(e.hours),
    days: eventDays(e.startsAt.getTime(), e.endsAt.getTime(), e.timezone),
    notes: e.notes,
    status: e.status,
    archived: e.archivedAt !== null,
    isSample: e.isSample,
    imagePath: e.imageKey ? mediaPath(e.imageKey) : null,
    updatedAt: e.updatedAt,
  };
}

export interface EventPiece {
  productId: string;
  sku: string;
  title: string;
  status: ProductStatus;
  quantity: number;
  assignedAt: Date;
  releasedAt: Date | null;
  thumbnailPath: string | null;
}

export async function listEventProducts(db: Db, eventId: string): Promise<EventPiece[]> {
  const rows = await db
    .select({
      productId: products.id,
      sku: products.sku,
      title: products.title,
      status: products.status,
      quantity: products.quantity,
      assignedAt: eventProducts.assignedAt,
      releasedAt: eventProducts.releasedAt,
      thumb: sql<string | null>`(SELECT pi.r2_key FROM product_image pi WHERE pi.product_id = product.id AND pi.is_primary = 1)`,
    })
    .from(eventProducts)
    .innerJoin(products, eq(products.id, eventProducts.productId))
    .where(eq(eventProducts.eventId, eventId))
    .orderBy(asc(products.sku))
    .all();
  return rows.map(({ thumb, ...r }) => ({ ...r, thumbnailPath: thumb ? mediaPath(thumb) : null }));
}

// ---------------------------------------------------------------------------
// Taking pieces to an event (EVT-5, EVT-6)
// ---------------------------------------------------------------------------

/** Statuses a piece can be taken to an event from. Anything else (sold, draft, already at an event) is skipped with a reason. */
const ASSIGNABLE: ProductStatus[] = ["AVAILABLE", "RESERVED"];

export async function assignProducts(
  db: Db,
  actor: Actor,
  eventId: string,
  productIds: string[],
): Promise<{ ok: true; assigned: number; skipped: { sku: string; title: string; reason: string }[] } | EventError | InventoryError> {
  const event = await db.select({ id: events.id, status: events.status, archivedAt: events.archivedAt }).from(events).where(eq(events.id, eventId)).get();
  if (!event) return fail("NOT_FOUND", "That event doesn't exist.");
  if (event.archivedAt) return fail("INVALID", "That event is archived.");
  if (event.status === "CANCELLED") return fail("INVALID", "That event is cancelled.");
  const unique = [...new Set(productIds)];
  if (!unique.length) return { ok: true, assigned: 0, skipped: [] };

  const rows = [];
  for (let i = 0; i < unique.length; i += 50) {
    rows.push(...(await db.select({ id: products.id, sku: products.sku, title: products.title, status: products.status, quantity: products.quantity }).from(products).where(inArray(products.id, unique.slice(i, i + 50))).all()));
  }
  if (rows.length !== unique.length) return fail("NOT_FOUND", "One of those pieces doesn't exist.");

  const skipped: { sku: string; title: string; reason: string }[] = [];
  const eligible = rows.filter((p) => {
    if (ASSIGNABLE.includes(p.status)) return true;
    skipped.push({ sku: p.sku, title: p.title, reason: p.status === "AT_EVENT" ? "already at an event" : p.status === "SOLD" ? "already sold" : p.status === "DRAFT" ? "still a draft" : "not available" });
    return false;
  });
  if (!eligible.length) return { ok: true, assigned: 0, skipped };

  const result = await moveProducts(
    db,
    actor,
    eligible.map((p) => ({
      id: p.id,
      from: p.status,
      quantity: p.quantity,
      to: "AT_EVENT" as const,
      extra: [db.insert(eventProducts).values({ id: newId(), eventId, productId: p.id, previousStatus: p.status })],
    })),
    { note: "Taken to event", eventId },
  );
  if (!result.ok) return result;
  await runBatch(db, [auditStatement(db, { userId: actor.id, action: "event.assign", entityType: "event", entityId: eventId, diff: { productIds: eligible.map((p) => p.id) } })]);
  return { ok: true, assigned: eligible.length, skipped };
}

async function openLinks(db: Db, eventId: string, productIds?: string[]) {
  return db
    .select({
      linkId: eventProducts.id,
      productId: products.id,
      sku: products.sku,
      title: products.title,
      status: products.status,
      quantity: products.quantity,
      previousStatus: eventProducts.previousStatus,
    })
    .from(eventProducts)
    .innerJoin(products, eq(products.id, eventProducts.productId))
    .where(and(eq(eventProducts.eventId, eventId), isNull(eventProducts.releasedAt), productIds ? inArray(eventProducts.productId, productIds) : undefined))
    .all();
}

const returnStatus = (previous: ProductStatus | null): ProductStatus => (previous === "RESERVED" ? "RESERVED" : "AVAILABLE");

/** Brings pieces back from an event. Those still there return to what they were before. Sold pieces just stop being listed. */
async function release(db: Db, actor: Actor, eventId: string, links: Awaited<ReturnType<typeof openLinks>>, note: string) {
  const back = links.filter((l) => l.status === "AT_EVENT");
  const now = new Date();
  const moved = await moveProducts(
    db,
    actor,
    back.map((l) => ({
      id: l.productId,
      from: l.status,
      quantity: l.quantity,
      to: returnStatus(l.previousStatus),
      extra: [db.update(eventProducts).set({ releasedAt: now }).where(eq(eventProducts.id, l.linkId))],
    })),
    { note, eventId },
  );
  if (!moved.ok) return moved;
  const rest = links.filter((l) => l.status !== "AT_EVENT");
  if (rest.length) await runBatch(db, rest.map((l) => db.update(eventProducts).set({ releasedAt: now }).where(eq(eventProducts.id, l.linkId))));
  return { ok: true as const, returned: back.length, alreadyGone: rest.length };
}

export async function unassignProducts(
  db: Db,
  actor: Actor,
  eventId: string,
  productIds: string[],
): Promise<{ ok: true; returned: number } | EventError | InventoryError> {
  const links = await openLinks(db, eventId, productIds);
  if (!links.length) return fail("NOT_FOUND", "Those pieces aren't at this event.");
  const result = await release(db, actor, eventId, links, "Taken off event");
  if (!result.ok) return result;
  await runBatch(db, [auditStatement(db, { userId: actor.id, action: "event.unassign", entityType: "event", entityId: eventId, diff: { productIds } })]);
  return { ok: true, returned: result.returned };
}

/** What "Wrap up event" will do (EVT-6): unsold pieces go back on the shelf, sold ones are listed so the owner can check. */
export async function wrapUpPreview(db: Db, eventId: string) {
  const links = await openLinks(db, eventId);
  const pick = (l: (typeof links)[number]) => ({ productId: l.productId, sku: l.sku, title: l.title, status: l.status, quantity: l.quantity });
  return {
    unsold: links.filter((l) => l.status === "AT_EVENT").map((l) => ({ ...pick(l), returnsTo: returnStatus(l.previousStatus) })),
    other: links.filter((l) => l.status !== "AT_EVENT").map(pick),
  };
}

export async function wrapUpEvent(db: Db, actor: Actor, eventId: string): Promise<{ ok: true; returned: number; alreadyGone: number } | EventError | InventoryError> {
  const event = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get();
  if (!event) return fail("NOT_FOUND", "That event doesn't exist.");
  const links = await openLinks(db, eventId);
  const result = await release(db, actor, eventId, links, "Event wrapped up");
  if (!result.ok) return result;
  await runBatch(db, [auditStatement(db, { userId: actor.id, action: "event.wrapup", entityType: "event", entityId: eventId, diff: { returned: result.returned } })]);
  return { ok: true, returned: result.returned, alreadyGone: result.alreadyGone };
}

/** Pieces that could be taken to an event now. */
export async function assignablePieces(db: Db, opts: { q?: string; limit?: number } = {}) {
  const q = opts.q?.trim().toLowerCase();
  return db
    .select({ id: products.id, sku: products.sku, title: products.title, status: products.status, quantity: products.quantity })
    .from(products)
    .where(
      and(
        inArray(products.status, ASSIGNABLE),
        q ? sql`(lower(${products.title}) LIKE ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\' OR ${products.sku} LIKE ${`%${q.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\')` : undefined,
      ),
    )
    .orderBy(asc(products.title))
    .limit(opts.limit ?? 100)
    .all();
}
