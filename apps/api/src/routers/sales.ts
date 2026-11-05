import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PAYMENT_METHODS, SALE_CHANNELS, SALE_PERIODS, SALE_STATUSES, customerSchema, dayStartMs, nextDayStartMs, saleInputSchema } from "@ffa/validators";
import { createCustomer, customersCsv, anonymizeCustomer, getCustomer, searchCustomers, updateCustomer, type CustomerError } from "../services/customers";
import { loadPosCatalog } from "../services/pos";
import { daySummary, getSale, listSales, loadThreshold, recordSale, salesCsv, salesSummary, sendReceipt, voidSale, type SaleError, type SaleFilters } from "../services/sales";
import type { Actor } from "../services/inventory";
import { loadSettings } from "../services/settings";
import { adminProcedure, router, staffProcedure } from "../trpc";

const CODES = { NOT_FOUND: "NOT_FOUND", INVALID: "BAD_REQUEST", CONFLICT: "CONFLICT", FORBIDDEN: "FORBIDDEN" } as const satisfies Record<SaleError["code"] | CustomerError["code"], TRPCError["code"]>;
const failure = (e: SaleError | CustomerError) => new TRPCError({ code: CODES[e.code], message: e.message });

const id = z.string().min(1).max(40);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const actorOf = (ctx: { user: { id: string; role: Actor["role"] }; source: Actor["source"] }): Actor => ({ id: ctx.user.id, role: ctx.user.role, source: ctx.source });

const filterInput = z.object({
  from: day.optional(),
  to: day.optional(),
  channel: z.enum(SALE_CHANNELS).optional(),
  eventId: id.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(SALE_STATUSES).optional(),
  customerId: id.optional(),
  /** Exact sale number, for finding a receipt. */
  number: z.number().int().positive().optional(),
});

function toFilters(input: z.infer<typeof filterInput>): SaleFilters {
  const from = input.from ? dayStartMs(input.from) : null;
  const to = input.to ? dayStartMs(input.to) : null;
  return {
    fromMs: from ?? undefined,
    toMs: to === null ? undefined : nextDayStartMs(to),
    channel: input.channel,
    eventId: input.eventId,
    method: input.method,
    status: input.status,
    customerId: input.customerId,
    number: input.number,
  };
}

export const salesRouter = router({
  /** Records a sale from the POS or the admin. Safe to retry with the same idempotencyKey (POS-10). */
  record: staffProcedure.input(saleInputSchema).mutation(async ({ ctx, input }) => {
    const settings = await loadSettings(ctx.db);
    const result = await recordSale(ctx.db, actorOf(ctx), input, { now: Date.now(), settings, email: ctx.email });
    if (!result.ok) throw failure(result);
    return result;
  }),

  /** Undo a sale and put its pieces back (POS-12). Staff can undo a sale made today, the administrator any sale. */
  void: staffProcedure.input(z.object({ saleId: id, reason: z.string().trim().min(1, "Please add a short reason.").max(200) })).mutation(async ({ ctx, input }) => {
    const sale = await getSale(ctx.db, input.saleId);
    if (!sale || (ctx.user.role !== "ADMIN" && sale.soldByUserId !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That sale doesn't exist." });
    const result = await voidSale(ctx.db, actorOf(ctx), input.saleId, input.reason, Date.now());
    if (!result.ok) throw failure(result);
    return { ok: true as const };
  }),

  /** One sale. Staff can open their own, the administrator any. */
  get: staffProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const sale = await getSale(ctx.db, input.id);
    if (!sale || (ctx.user.role !== "ADMIN" && sale.soldByUserId !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That sale doesn't exist." });
    return sale;
  }),

  sendReceipt: staffProcedure.input(z.object({ saleId: id, email: z.string().trim().email().max(254) })).mutation(async ({ ctx, input }) => {
    const sale = await getSale(ctx.db, input.saleId);
    if (!sale || (ctx.user.role !== "ADMIN" && sale.soldByUserId !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That sale doesn't exist." });
    if (sale.status === "VOIDED") throw new TRPCError({ code: "BAD_REQUEST", message: "That sale was undone, so there is no receipt." });
    const outcome = await sendReceipt({ settings: await loadSettings(ctx.db), email: ctx.email }, sale, input.email);
    return { outcome };
  }),

  /** Today's sales and totals for the end-of-day screen (POS-14). Staff see their own, the administrator everyone's. */
  today: staffProcedure.query(async ({ ctx }) => {
    const now = Date.now();
    const mine = ctx.user.role === "ADMIN" ? undefined : ctx.user.id;
    const summary = await daySummary(ctx.db, now, { soldByUserId: mine });
    const list = await listSales(ctx.db, { fromMs: summary.dayStartMs, toMs: nextDayStartMs(summary.dayStartMs), soldByUserId: mine, limit: 100 });
    return { summary, sales: list.rows };
  }),

  // ---- administrator ----
  list: adminProcedure
    .input(filterInput.extend({ limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) }).default({ limit: 50, offset: 0 }))
    .query(({ ctx, input }) => listSales(ctx.db, { ...toFilters(input), limit: input.limit, offset: input.offset })),

  /** Sales totals for the dashboard (SALE-4) and the small-supplier tracker (SALE-6). */
  summary: adminProcedure.input(z.object({ breakdown: z.enum(SALE_PERIODS).default("month") }).default({ breakdown: "month" })).query(async ({ ctx, input }) => {
    const now = Date.now();
    const [summary, threshold] = await Promise.all([salesSummary(ctx.db, now, { breakdown: input.breakdown }), loadSettings(ctx.db).then((s) => loadThreshold(ctx.db, now, s))]);
    return { ...summary, threshold };
  }),

  exportCsv: adminProcedure.input(filterInput.default({})).query(({ ctx, input }) => salesCsv(ctx.db, toFilters(input))),
});

export const customersRouter = router({
  /** For picking a customer at a sale. Only contact details, no spending (CUS-2). */
  search: staffProcedure.input(z.object({ q: z.string().trim().max(100), limit: z.number().int().min(1).max(25).default(10) })).query(async ({ ctx, input }) => {
    if (input.q.length < 2) return [];
    const { rows } = await searchCustomers(ctx.db, input.q, { limit: input.limit });
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone }));
  }),

  create: staffProcedure.input(customerSchema).mutation(async ({ ctx, input }) => {
    const result = await createCustomer(ctx.db, ctx.user.id, input, ctx.source === "POS" ? "POS" : "ADMIN");
    if (!result.ok) throw failure(result);
    return { id: result.id };
  }),

  // ---- administrator ----
  list: adminProcedure
    .input(z.object({ q: z.string().trim().max(100).default(""), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) }).default({ q: "", limit: 50, offset: 0 }))
    .query(({ ctx, input }) => searchCustomers(ctx.db, input.q, { limit: input.limit, offset: input.offset })),

  get: adminProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const customer = await getCustomer(ctx.db, input.id);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "That customer doesn't exist." });
    const sales = await listSales(ctx.db, { customerId: input.id, limit: 100 });
    return { customer, sales: sales.rows };
  }),

  update: adminProcedure.input(z.object({ id, fields: customerSchema })).mutation(async ({ ctx, input }) => {
    const result = await updateCustomer(ctx.db, ctx.user.id, input.id, input.fields);
    if (!result.ok) throw failure(result);
    return { ok: true as const };
  }),

  anonymize: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const result = await anonymizeCustomer(ctx.db, ctx.user.id, input.id);
    if (!result.ok) throw failure(result);
    return { ok: true as const };
  }),

  exportCsv: adminProcedure.query(({ ctx }) => customersCsv(ctx.db)),
});

export const posRouter = router({
  /** Everything the phone keeps for selling offline (POS-10). */
  catalog: staffProcedure.query(({ ctx }) => loadPosCatalog(ctx.db, Date.now())),
});
