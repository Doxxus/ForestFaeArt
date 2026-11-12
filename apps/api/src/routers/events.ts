import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { EVENT_STATUSES } from "@ffa/validators";
import {
  assignablePieces,
  assignProducts,
  createEvent,
  duplicateEvent,
  getEvent,
  listEventProducts,
  listEvents,
  removeEventImage,
  setEventArchived,
  unassignProducts,
  updateEvent,
  wrapUpEvent,
  wrapUpPreview,
  type EventError,
} from "../services/events";
import type { InventoryError } from "../services/inventory";
import { loadSettings } from "../services/settings";
import { adminProcedure, optionalUser, publicProcedure, router, staffProcedure, type Context } from "../trpc";

const CODES = {
  NOT_FOUND: "NOT_FOUND",
  INVALID: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  INVALID_TRANSITION: "BAD_REQUEST",
  FORBIDDEN: "FORBIDDEN",
  REASON_REQUIRED: "BAD_REQUEST",
  INVALID_QUANTITY: "BAD_REQUEST",
  INSUFFICIENT_STOCK: "CONFLICT",
  NOT_SELLABLE: "CONFLICT",
} as const satisfies Record<EventError["code"] | InventoryError["code"], TRPCError["code"]>;

/** Event service results are either an EventError or an InventoryError. Both become a friendly API error. */
const eventError = (e: EventError | InventoryError) => new TRPCError({ code: CODES[e.code], message: e.message });

const id = z.string().min(1).max(40);
const day = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), open: z.string().nullable(), close: z.string().nullable() });
const ms = z.number().int().min(0).max(8_640_000_000_000);
const eventFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  websiteUrl: z.string().trim().max(500).nullable(),
  venue: z.string().trim().max(200),
  address: z.string().trim().max(400),
  startsAt: ms,
  endsAt: ms,
  timezone: z.string().max(60),
  hours: z.array(day).max(60),
  notes: z.string().max(2000),
  status: z.enum(EVENT_STATUSES),
};

async function siteVisibility(ctx: Context) {
  const settings = await loadSettings(ctx.db);
  return { settings, visible: settings.siteLive || (await optionalUser(ctx)) !== null };
}

const mapUrl = (address: string, venue: string) => {
  const q = [venue, address].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
};

export const eventsRouter = router({
  // ---- staff and admin ----
  list: staffProcedure
    .input(z.object({ when: z.enum(["upcoming", "past", "all"]).default("all"), includeArchived: z.boolean().default(false) }).default({ when: "all", includeArchived: false }))
    .query(({ ctx, input }) => listEvents(ctx.db, input)),

  get: staffProcedure.input(z.object({ idOrSlug: id })).query(async ({ ctx, input }) => {
    const event = await getEvent(ctx.db, input.idOrSlug);
    if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "That event doesn't exist." });
    return { ...event, mapUrl: mapUrl(event.address, event.venue), pieces: await listEventProducts(ctx.db, event.id) };
  }),

  assignablePieces: staffProcedure.input(z.object({ q: z.string().max(100).optional() })).query(({ ctx, input }) => assignablePieces(ctx.db, { q: input.q })),

  assign: staffProcedure.input(z.object({ eventId: id, productIds: z.array(id).max(500) })).mutation(async ({ ctx, input }) => {
    const r = await assignProducts(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: ctx.source }, input.eventId, input.productIds);
    if (!r.ok) throw eventError(r);
    return { assigned: r.assigned, skipped: r.skipped };
  }),

  unassign: staffProcedure.input(z.object({ eventId: id, productIds: z.array(id).min(1).max(500) })).mutation(async ({ ctx, input }) => {
    const r = await unassignProducts(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: ctx.source }, input.eventId, input.productIds);
    if (!r.ok) throw eventError(r);
    return { returned: r.returned };
  }),

  wrapUpPreview: staffProcedure.input(z.object({ eventId: id })).query(({ ctx, input }) => wrapUpPreview(ctx.db, input.eventId)),

  wrapUp: staffProcedure.input(z.object({ eventId: id })).mutation(async ({ ctx, input }) => {
    const r = await wrapUpEvent(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: ctx.source }, input.eventId);
    if (!r.ok) throw eventError(r);
    return { returned: r.returned, alreadyGone: r.alreadyGone };
  }),

  // ---- administrator only ----
  create: adminProcedure
    .input(z.object({ ...eventFields, description: eventFields.description.default(""), websiteUrl: eventFields.websiteUrl.default(null), venue: eventFields.venue.default(""), address: eventFields.address.default(""), timezone: eventFields.timezone.default("America/Toronto"), hours: eventFields.hours.default([]), notes: eventFields.notes.default(""), status: eventFields.status.default("DRAFT") }))
    .mutation(async ({ ctx, input }) => {
      const r = await createEvent(ctx.db, ctx.user.id, input);
      if (!r.ok) throw eventError(r);
      return { id: r.id, slug: r.slug };
    }),

  update: adminProcedure.input(z.object(eventFields).partial().extend({ id })).mutation(async ({ ctx, input }) => {
    const { id: eventId, ...patch } = input;
    const r = await updateEvent(ctx.db, ctx.user.id, eventId, patch);
    if (!r.ok) throw eventError(r);
    return { ok: true as const };
  }),

  duplicate: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const r = await duplicateEvent(ctx.db, ctx.user.id, input.id);
    if (!r.ok) throw eventError(r);
    return { id: r.id, slug: r.slug };
  }),

  setArchived: adminProcedure.input(z.object({ id, archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const r = await setEventArchived(ctx.db, ctx.user.id, input.id, input.archived);
    if (!r.ok) throw eventError(r);
    return { ok: true as const };
  }),

  removeImage: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const r = await removeEventImage(ctx.db, ctx.env.MEDIA, ctx.user.id, input.id);
    if (!r.ok) throw eventError(r);
    return { ok: true as const };
  }),

  // ---- public (only once the site is live, WEB-18) ----
  publicList: publicProcedure.input(z.object({ when: z.enum(["upcoming", "past"]).default("upcoming") }).default({ when: "upcoming" })).query(async ({ ctx, input }) => {
    const { visible, settings } = await siteVisibility(ctx);
    if (!visible) return [];
    const all = await listEvents(ctx.db, { when: input.when });
    return all
      .filter((e) => e.status !== "DRAFT" && (!e.isSample || settings.showSampleData))
      .map((e) => ({ title: e.title, slug: e.slug, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt, timezone: e.timezone, cancelled: e.status === "CANCELLED", imagePath: e.imagePath }));
  }),

  publicGet: publicProcedure.input(z.object({ slug: z.string().trim().min(1).max(100) })).query(async ({ ctx, input }) => {
    const notFound = new TRPCError({ code: "NOT_FOUND", message: "We couldn't find that event." });
    const { visible, settings } = await siteVisibility(ctx);
    if (!visible) throw notFound;
    const e = await getEvent(ctx.db, input.slug);
    if (!e || e.archived || e.status === "DRAFT" || (e.isSample && !settings.showSampleData)) throw notFound;
    return {
      title: e.title,
      slug: e.slug,
      description: e.description,
      websiteUrl: e.websiteUrl,
      venue: e.venue,
      address: e.address,
      mapUrl: mapUrl(e.address, e.venue),
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      hours: e.hours,
      cancelled: e.status === "CANCELLED",
      imagePath: e.imagePath,
    };
  }),
});
