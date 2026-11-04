import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, inventoryTransactions, or, products, users } from "@ffa/db";
import { PRODUCT_STATUSES } from "@ffa/validators";
import { inventoryError, serviceError } from "../errors";
import { mediaPath } from "../services/images";
import { PRODUCT_SORTS, listProducts } from "../services/product-list";
import {
  getProductCategoryIds,
  getProductMetadata,
  setProductCategories,
  setProductMetadata,
  updateProduct,
} from "../services/catalogue";
import { adjustStock, changeStatus, createProduct, type Actor } from "../services/inventory";
import { projectProduct } from "../services/projections";
import { router, staffProcedure, type Context } from "../trpc";

const productId = z.string().min(1).max(40);
const reason = z.string().trim().max(500);

type Authed = Context & { user: { id: string; role: "ADMIN" | "STAFF" } };
const actorOf = (ctx: Authed): Actor => ({ id: ctx.user.id, role: ctx.user.role, source: ctx.source });

export const productsRouter = router({
  /** Search, filter and sort the inventory (INV-7). The "Needs photos" queue is `hasPhoto: false`. */
  list: staffProcedure
    .input(
      z.object({
        q: z.string().trim().max(100).optional(),
        status: z.array(z.enum(PRODUCT_STATUSES)).max(7).optional(),
        categoryId: z.string().max(40).optional(),
        listedOnEtsy: z.boolean().optional(),
        hasPhoto: z.boolean().optional(),
        portfolioVisible: z.boolean().optional(),
        includeArchived: z.boolean().optional(),
        sort: z.enum(PRODUCT_SORTS).default("newest"),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(100_000).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { rows, total } = await listProducts(ctx.db, input);
      return {
        total,
        items: rows.map((r) => ({
          ...projectProduct(r.product, ctx.user.role),
          imageCount: r.imageCount,
          thumbnailPath: r.thumbnailKey ? mediaPath(r.thumbnailKey) : null,
        })),
      };
    }),

  /** By id or by SKU, so a scanned QR code resolves directly. Includes categories and metadata values. */
  get: staffProcedure.input(z.object({ idOrSku: z.string().trim().min(1).max(40) })).query(async ({ ctx, input }) => {
    const row = await ctx.db
      .select()
      .from(products)
      .where(or(eq(products.id, input.idOrSku), eq(products.sku, input.idOrSku.toUpperCase())))
      .get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That item doesn't exist." });
    const [categoryIds, metadata] = await Promise.all([getProductCategoryIds(ctx.db, row.id), getProductMetadata(ctx.db, row.id)]);
    return { ...projectProduct(row, ctx.user.role), categoryIds, metadata };
  }),

  update: staffProcedure
    .input(
      z.object({
        productId,
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        slug: z.string().trim().max(80).optional(),
        priceCents: z.number().int().min(0).max(10_000_000).optional(),
        costCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
        featured: z.boolean().optional(),
        portfolioVisible: z.boolean().optional(),
        onlineVisible: z.boolean().optional(),
        onlinePurchasable: z.boolean().optional(),
        hidePrice: z.boolean().optional(),
        weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
        lengthMm: z.number().int().min(0).max(100_000).nullable().optional(),
        widthMm: z.number().int().min(0).max(100_000).nullable().optional(),
        heightMm: z.number().int().min(0).max(100_000).nullable().optional(),
        shippingClass: z.string().trim().max(60).nullable().optional(),
        taxCategory: z.string().trim().max(60).nullable().optional(),
        fragile: z.boolean().optional(),
        listedOnEtsy: z.boolean().optional(),
        etsyUrl: z.url({ protocol: /^https$/ }).max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { productId: id, ...patch } = input;
      if (patch.costCents !== undefined && ctx.user.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an administrator can change the cost." });
      }
      const result = await updateProduct(ctx.db, ctx.user.id, id, patch);
      if (!result.ok) throw serviceError(result);
      return { changed: result.changed };
    }),

  setCategories: staffProcedure.input(z.object({ productId, categoryIds: z.array(z.string().min(1).max(40)).max(50) })).mutation(async ({ ctx, input }) => {
    const result = await setProductCategories(ctx.db, ctx.user.id, input.productId, input.categoryIds);
    if (!result.ok) throw serviceError(result);
    return { ok: true as const };
  }),

  /** Values by field key. Null or an empty value clears the field. `addNewChoices` turns a new tag or collection into a choice. */
  setMetadata: staffProcedure
    .input(
      z.object({
        productId,
        values: z.record(z.string().max(60), z.union([z.string().max(600), z.number(), z.boolean(), z.array(z.string().max(80)).max(200), z.null()])),
        addNewChoices: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await setProductMetadata(ctx.db, ctx.user.id, input.productId, input.values, { addNewChoices: input.addNewChoices });
      if (!result.ok) throw serviceError(result);
      return { ok: true as const };
    }),

  /** The piece's inventory history, newest first (INV-6). */
  history: staffProcedure.input(z.object({ productId })).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: inventoryTransactions.id,
        at: inventoryTransactions.at,
        user: users.name,
        fromStatus: inventoryTransactions.fromStatus,
        toStatus: inventoryTransactions.toStatus,
        quantityDelta: inventoryTransactions.quantityDelta,
        quantityAfter: inventoryTransactions.quantityAfter,
        notes: inventoryTransactions.notes,
        source: inventoryTransactions.source,
      })
      .from(inventoryTransactions)
      .leftJoin(users, eq(users.id, inventoryTransactions.userId))
      .where(eq(inventoryTransactions.productId, input.productId))
      .orderBy(desc(inventoryTransactions.at), desc(inventoryTransactions.id))
      .limit(200)
      .all();
    return rows;
  }),

  create: staffProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).default(""),
        priceCents: z.number().int().min(0).max(10_000_000).default(0),
        costCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
        quantity: z.number().int().min(0).max(100_000).default(1),
        listedOnEtsy: z.boolean().default(false),
        etsyUrl: z.url().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.costCents !== undefined && ctx.user.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an administrator can set the cost." });
      }
      const result = await createProduct(ctx.db, actorOf(ctx), input);
      if (!result.ok) throw inventoryError(result);
      return { id: result.id, sku: result.sku, slug: result.slug };
    }),

  changeStatus: staffProcedure
    .input(z.object({ productId, to: z.enum(PRODUCT_STATUSES), reason: reason.optional(), restoreQuantity: z.number().int().min(1).max(100_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await changeStatus(ctx.db, actorOf(ctx), input);
      if (!result.ok) throw inventoryError(result);
      return { status: result.status, quantity: result.quantity };
    }),

  adjustStock: staffProcedure
    .input(z.object({ productId, newQuantity: z.number().int().min(0).max(100_000), reason: reason.min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await adjustStock(ctx.db, actorOf(ctx), input);
      if (!result.ok) throw inventoryError(result);
      return { status: result.status, quantity: result.quantity };
    }),
});
