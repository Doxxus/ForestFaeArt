import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray, lt, or, products, slugRedirects, sql } from "@ffa/db";
import { loadSettings } from "../services/settings";
import { toPublicProduct } from "../services/projections";
import { optionalUser, publicProcedure, router, type Context } from "../trpc";

// Draft and archived items never leave the database through this router.
const LISTABLE = ["AVAILABLE", "AT_EVENT", "PENDING_PAYMENT", "RESERVED", "SOLD"] as const;
// Written as plain SQL because drizzle drops the table prefix in single-table selects, which would bind to product_image.id.
const hasPhoto = sql<number>`EXISTS (SELECT 1 FROM product_image pi WHERE pi.product_id = product.id)`;

/** Nothing is public until the owner publishes the site (WEB-18). Signed-in staff can still preview it. */
async function siteIsVisible(ctx: Context) {
  const settings = await loadSettings(ctx.db);
  const visible = settings.siteLive || (await optionalUser(ctx)) !== null;
  return { settings, visible };
}

export const catalogRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(60).default(24), cursor: z.string().max(40).optional() }))
    .query(async ({ ctx, input }) => {
      const { settings, visible } = await siteIsVisible(ctx);
      if (!visible) return { items: [], nextCursor: null };
      const rows = await ctx.db
        .select({ product: products, hasPhoto })
        .from(products)
        .where(and(inArray(products.status, [...LISTABLE]), eq(products.portfolioVisible, true), input.cursor ? lt(products.id, input.cursor) : undefined))
        .orderBy(desc(products.id))
        .limit(input.limit + 1)
        .all();
      const page = rows.slice(0, input.limit);
      const items = page.flatMap((r) => toPublicProduct(r.product, settings, Boolean(r.hasPhoto)) ?? []);
      return { items, nextCursor: rows.length > input.limit ? page[page.length - 1]!.product.id : null };
    }),

  /** By SKU (what the QR code holds) or by slug. Old slugs still resolve. */
  get: publicProcedure.input(z.object({ skuOrSlug: z.string().trim().min(1).max(100) })).query(async ({ ctx, input }) => {
    const notFound = new TRPCError({ code: "NOT_FOUND", message: "We couldn't find that piece." });
    const { settings, visible } = await siteIsVisible(ctx);
    if (!visible) throw notFound;
    const key = input.skuOrSlug;
    const redirect = await ctx.db.select({ productId: slugRedirects.productId }).from(slugRedirects).where(eq(slugRedirects.slug, key)).get();
    const row = await ctx.db
      .select({ product: products, hasPhoto })
      .from(products)
      .where(or(eq(products.sku, key.toUpperCase()), eq(products.slug, key), redirect ? eq(products.id, redirect.productId) : undefined))
      .get();
    const product = row ? toPublicProduct(row.product, settings, Boolean(row.hasPhoto)) : null;
    if (!product) throw notFound;
    return product;
  }),
});
