import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CONTENT_KEYS, getContent, isContentKey, listContent, removeContentImage, updateContent } from "../services/content";
import { loadAttention } from "../services/attention";
import { listEvents } from "../services/events";
import { loadPortfolio, sitemapPieces } from "../services/portfolio";
import { loadSettings } from "../services/settings";
import { adminProcedure, optionalUser, publicProcedure, router, staffProcedure } from "../trpc";

const key = z.enum(CONTENT_KEYS);
const CODES = { NOT_FOUND: "NOT_FOUND", INVALID: "BAD_REQUEST" } as const;

export const contentRouter = router({
  /** The pages the owner can edit, and whether each one is still placeholder text. */
  list: adminProcedure.query(({ ctx }) => listContent(ctx.db)),

  get: adminProcedure.input(z.object({ key })).query(async ({ ctx, input }) => {
    const page = await getContent(ctx.db, input.key);
    if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "That page doesn't exist." });
    return page;
  }),

  update: adminProcedure
    .input(z.object({ key, title: z.string().trim().min(1).max(160).optional(), body: z.string().max(20_000).optional(), isDraft: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { key: k, ...patch } = input;
      const r = await updateContent(ctx.db, ctx.user.id, k, patch);
      if (!r.ok) throw new TRPCError({ code: CODES[r.code], message: r.message });
      return { ok: true as const };
    }),

  removeImage: adminProcedure.input(z.object({ key })).mutation(async ({ ctx, input }) => {
    const r = await removeContentImage(ctx.db, ctx.env.MEDIA, ctx.user.id, input.key);
    if (!r.ok) throw new TRPCError({ code: CODES[r.code], message: r.message });
    return { ok: true as const };
  }),

  /** A page for the public site. Nothing is served before the site is published, except to signed-in staff previewing it. */
  publicGet: publicProcedure.input(z.object({ key: z.string().max(40) })).query(async ({ ctx, input }) => {
    const notFound = new TRPCError({ code: "NOT_FOUND", message: "We couldn't find that page." });
    if (!isContentKey(input.key)) throw notFound;
    const visible = (await loadSettings(ctx.db)).siteLive || (await optionalUser(ctx)) !== null;
    if (!visible) throw notFound;
    const page = await getContent(ctx.db, input.key);
    if (!page) throw notFound;
    return { title: page.title, body: page.body, imagePath: page.imagePath };
  }),
});

export const siteRouter = router({
  /** What needs attention, for the dashboard and the publishing checklist. */
  attention: staffProcedure.query(({ ctx }) => loadAttention(ctx.db, { emailConfigured: ctx.email !== null })),

  /** Everything a search engine may be told about. Empty until the site is published. Signed-in preview does not count. */
  sitemap: publicProcedure.query(async ({ ctx }) => {
    const settings = await loadSettings(ctx.db);
    if (!settings.siteLive) return { live: false as const, pieces: [], events: [] };
    const [portfolio, upcoming, past] = await Promise.all([loadPortfolio(ctx.db, settings), listEvents(ctx.db, { when: "upcoming" }), listEvents(ctx.db, { when: "past" })]);
    return {
      live: true as const,
      pieces: sitemapPieces(portfolio),
      events: [...upcoming, ...past].filter((e) => e.status !== "DRAFT").map((e) => ({ slug: e.slug, startsAt: e.startsAt })),
    };
  }),
});
