import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray, lt, or, productImages, products, slugRedirects, sql } from "@ffa/db";
import { loadSettings } from "../services/settings";
import { getProductCategoryIds, getProductMetadata, listCategories } from "../services/catalogue";
import { listProductImages, mediaPath } from "../services/images";
import { toPublicProduct } from "../services/projections";
import { optionalUser, publicProcedure, router, type Context } from "../trpc";

const publicImage = (p: typeof productImages.$inferSelect) => ({ path: mediaPath(p.r2Key), altText: p.altText, width: p.width, height: p.height });

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
      const visibleRows = page.flatMap((r) => {
        const product = toPublicProduct(r.product, settings, Boolean(r.hasPhoto));
        return product ? [{ id: r.product.id, product }] : [];
      });
      const primaries = visibleRows.length
        ? await ctx.db.select().from(productImages).where(and(inArray(productImages.productId, visibleRows.map((r) => r.id)), eq(productImages.isPrimary, true))).all()
        : [];
      const byProduct = new Map(primaries.map((p) => [p.productId, publicImage(p)]));
      const items = visibleRows.map((r) => ({ ...r.product, image: byProduct.get(r.id) ?? null }));
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
    if (!row || !product) throw notFound;
    const [metadata, cats, images] = await Promise.all([
      getProductMetadata(ctx.db, row.product.id, { publicOnly: true }),
      listCategories(ctx.db).then(async (all) => {
        const ids = new Set(await getProductCategoryIds(ctx.db, row.product.id));
        return all.filter((c) => ids.has(c.id) && !c.hidden).map((c) => ({ name: c.name, slug: c.slug }));
      }),
      listProductImages(ctx.db, row.product.id),
    ]);
    return {
      ...product,
      categories: cats,
      metadata: metadata.map(({ label, value }) => ({ label, value })),
      images: images.map(({ path, altText, width, height }) => ({ path, altText, width, height })),
    };
  }),
});
