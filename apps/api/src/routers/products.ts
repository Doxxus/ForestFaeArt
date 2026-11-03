import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, lt, or, and, products } from "@ffa/db";
import { PRODUCT_STATUSES } from "@ffa/validators";
import { inventoryError } from "../errors";
import { adjustStock, changeStatus, createProduct, type Actor } from "../services/inventory";
import { projectProduct } from "../services/projections";
import { router, staffProcedure, type Context } from "../trpc";

const productId = z.string().min(1).max(40);
const reason = z.string().trim().max(500);

type Authed = Context & { user: { id: string; role: "ADMIN" | "STAFF" } };
const actorOf = (ctx: Authed): Actor => ({ id: ctx.user.id, role: ctx.user.role, source: ctx.source });

export const productsRouter = router({
  list: staffProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().max(40).optional(),
        status: z.enum(PRODUCT_STATUSES).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(products)
        .where(and(input.cursor ? lt(products.id, input.cursor) : undefined, input.status ? eq(products.status, input.status) : undefined))
        .orderBy(desc(products.id))
        .limit(input.limit + 1)
        .all();
      const page = rows.slice(0, input.limit);
      return {
        items: page.map((row) => projectProduct(row, ctx.user.role)),
        nextCursor: rows.length > input.limit ? page[page.length - 1]!.id : null,
      };
    }),

  /** By id or by SKU, so a scanned QR code resolves directly. */
  get: staffProcedure.input(z.object({ idOrSku: z.string().trim().min(1).max(40) })).query(async ({ ctx, input }) => {
    const row = await ctx.db
      .select()
      .from(products)
      .where(or(eq(products.id, input.idOrSku), eq(products.sku, input.idOrSku.toUpperCase())))
      .get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That item doesn't exist." });
    return projectProduct(row, ctx.user.role);
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
