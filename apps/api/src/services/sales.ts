import { and, asc, customers, desc, eq, eventProducts, events, gte, inArray, isNull, lt, payments, products, saleItems, sales, sql, users } from "@ffa/db";
import {
  SALE_PERIODS,
  SELLABLE_STATUSES,
  canVoidSale,
  csvCell,
  newId,
  nextDayStartMs,
  periodStartMs,
  resolveOccurredAt,
  saleTotals,
  thresholdStatus,
  toCsv,
  trailingYearStartMs,
  type PaymentMethod,
  type ProductStatus,
  type SaleChannel,
  type SaleInput,
  type SalePeriod,
  type SaleStatus,
  type Settings,
  type ThresholdStatus,
} from "@ffa/validators";
import { saleReceipt } from "../email/templates";
import type { EmailProvider } from "../email/provider";
import { auditStatement } from "./audit";
import { runGuarded, saleLineStatements, voidLineStatements, type Actor } from "./inventory";
import { createCustomerStatement, customerDisplayName, findCustomerByEmail } from "./customers";
import type { Db } from "../store";

export type SaleErrorCode = "NOT_FOUND" | "INVALID" | "CONFLICT" | "FORBIDDEN";
export type SaleError = { ok: false; code: SaleErrorCode; message: string };
const fail = (code: SaleErrorCode, message: string): SaleError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];

const STATUS_WORDS: Record<ProductStatus, string> = {
  DRAFT: "still a draft",
  AVAILABLE: "available",
  RESERVED: "reserved",
  AT_EVENT: "at an event",
  PENDING_PAYMENT: "waiting for payment",
  SOLD: "already sold",
  ARCHIVED: "archived",
};

// ---------------------------------------------------------------------------
// Reading sales
// ---------------------------------------------------------------------------

export interface SaleSummary {
  id: string;
  number: number;
  status: SaleStatus;
  channel: SaleChannel;
  occurredAt: number;
  eventId: string | null;
  eventTitle: string | null;
  customerId: string | null;
  customerName: string | null;
  soldByName: string;
  soldByUserId: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  itemCount: number;
}

export interface SaleDetail extends SaleSummary {
  discountReason: string;
  notes: string;
  items: { id: string; productId: string; sku: string; title: string; quantity: number; priceCents: number }[];
  payment: { method: PaymentMethod; amountCents: number; provider: string; status: string } | null;
  voidedAt: number | null;
  voidedByName: string | null;
  voidReason: string | null;
  customerEmail: string | null;
}

const soldBy = sql<string>`(SELECT u.name FROM user u WHERE u.id = sale.sold_by_user_id)`;
const itemCount = sql<number>`(SELECT COALESCE(SUM(si.quantity), 0) FROM sale_item si WHERE si.sale_id = sale.id)`;
const method = sql<PaymentMethod | null>`(SELECT p.method FROM payment p WHERE p.sale_id = sale.id ORDER BY p.id LIMIT 1)`;

const summaryColumns = {
  sale: sales,
  eventTitle: events.title,
  customerFirst: customers.firstName,
  customerLast: customers.lastName,
  customerEmail: customers.email,
  customerPhone: customers.phone,
  soldByName: soldBy,
  itemCount,
  paymentMethod: method,
};

type SummaryRow = {
  sale: typeof sales.$inferSelect;
  eventTitle: string | null;
  customerFirst: string | null;
  customerLast: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  soldByName: string | null;
  itemCount: number;
  paymentMethod: PaymentMethod | null;
};

function toSummary(r: SummaryRow): SaleSummary {
  const s = r.sale;
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    channel: s.channel,
    occurredAt: s.occurredAt.getTime(),
    eventId: s.eventId,
    eventTitle: r.eventTitle,
    customerId: s.customerId,
    customerName: s.customerId ? customerDisplayName({ firstName: r.customerFirst ?? "", lastName: r.customerLast ?? "", email: r.customerEmail, phone: r.customerPhone }) : null,
    soldByName: r.soldByName ?? "",
    soldByUserId: s.soldByUserId,
    subtotalCents: s.subtotalCents,
    discountCents: s.discountCents,
    taxCents: s.taxCents,
    totalCents: s.totalCents,
    paymentMethod: r.paymentMethod,
    itemCount: r.itemCount,
  };
}

export interface SaleFilters {
  /** Inclusive range, as instants. */
  fromMs?: number;
  toMs?: number;
  channel?: SaleChannel;
  eventId?: string;
  method?: PaymentMethod;
  status?: SaleStatus;
  customerId?: string;
  soldByUserId?: string;
  number?: number;
  limit?: number;
  offset?: number;
}

function saleWhere(f: SaleFilters) {
  return and(
    f.fromMs === undefined ? undefined : gte(sales.occurredAt, new Date(f.fromMs)),
    f.toMs === undefined ? undefined : lt(sales.occurredAt, new Date(f.toMs)),
    f.channel ? eq(sales.channel, f.channel) : undefined,
    f.eventId ? eq(sales.eventId, f.eventId) : undefined,
    f.status ? eq(sales.status, f.status) : undefined,
    f.customerId ? eq(sales.customerId, f.customerId) : undefined,
    f.soldByUserId ? eq(sales.soldByUserId, f.soldByUserId) : undefined,
    f.number === undefined ? undefined : eq(sales.number, f.number),
    f.method ? sql`EXISTS (SELECT 1 FROM payment p WHERE p.sale_id = sale.id AND p.method = ${f.method})` : undefined,
  );
}

const baseQuery = (db: Db) =>
  db.select(summaryColumns).from(sales).leftJoin(customers, eq(customers.id, sales.customerId)).leftJoin(events, eq(events.id, sales.eventId));

/** Every sale matching the filters as CSV (SALE-3). Money is plain dollars so a spreadsheet can add it up. */
export async function salesCsv(db: Db, f: SaleFilters): Promise<string> {
  const rows = await db
    .select({ ...summaryColumns, itemsText: sql<string>`(SELECT group_concat(si.sku_snapshot || ' x' || si.quantity, '; ') FROM sale_item si WHERE si.sale_id = sale.id)` })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(events, eq(events.id, sales.eventId))
    .where(saleWhere(f))
    .orderBy(asc(sales.occurredAt), asc(sales.number))
    .limit(10_000)
    .all();
  const dollars = (c: number) => (c / 100).toFixed(2);
  return toCsv([
    ["Number", "Date", "Status", "Channel", "Event", "Customer", "Payment", "Items", "Subtotal", "Discount", "Discount reason", "Tax", "Total", "Sold by", "Notes"],
    ...rows.map((r) => {
      const s = toSummary(r);
      return [
        String(s.number),
        new Date(s.occurredAt).toISOString(),
        s.status,
        s.channel,
        csvCell(s.eventTitle ?? ""),
        csvCell(s.customerName ?? ""),
        s.paymentMethod ?? "",
        csvCell(r.itemsText ?? ""),
        dollars(s.subtotalCents),
        dollars(s.discountCents),
        csvCell(r.sale.discountReason),
        dollars(s.taxCents),
        dollars(s.totalCents),
        csvCell(s.soldByName),
        csvCell(r.sale.notes),
      ];
    }),
  ]);
}

export async function listSales(db: Db, f: SaleFilters): Promise<{ rows: SaleSummary[]; total: number; totalCents: number }> {
  const where = saleWhere(f);
  const [rows, totals] = await Promise.all([
    baseQuery(db)
      .where(where)
      .orderBy(desc(sales.occurredAt), desc(sales.number))
      .limit(f.limit ?? 50)
      .offset(f.offset ?? 0)
      .all(),
    db
      .select({ n: sql<number>`COUNT(*)`, cents: sql<number>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.totalCents} ELSE 0 END), 0)` })
      .from(sales)
      .where(where)
      .get(),
  ]);
  return { rows: rows.map(toSummary), total: totals?.n ?? 0, totalCents: totals?.cents ?? 0 };
}

export async function getSale(db: Db, id: string): Promise<SaleDetail | null> {
  const row = await baseQuery(db).where(eq(sales.id, id)).get();
  if (!row) return null;
  const [items, payment, voider] = await Promise.all([
    db.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(asc(saleItems.id)).all(),
    db.select().from(payments).where(eq(payments.saleId, id)).get(),
    row.sale.voidedByUserId ? db.select({ name: users.name }).from(users).where(eq(users.id, row.sale.voidedByUserId)).get() : Promise.resolve(undefined),
  ]);
  return {
    ...toSummary(row),
    discountReason: row.sale.discountReason,
    notes: row.sale.notes,
    items: items.map((i) => ({ id: i.id, productId: i.productId, sku: i.skuSnapshot, title: i.titleSnapshot, quantity: i.quantity, priceCents: i.priceCentsSnapshot })),
    payment: payment ? { method: payment.method, amountCents: payment.amountCents, provider: payment.provider, status: payment.status } : null,
    voidedAt: row.sale.voidedAt?.getTime() ?? null,
    voidedByName: voider?.name ?? null,
    voidReason: row.sale.voidReason,
    customerEmail: row.customerEmail,
  };
}

// ---------------------------------------------------------------------------
// Recording a sale
// ---------------------------------------------------------------------------

export type ReceiptOutcome = "NONE" | "SENT" | "FAILED" | "NOT_SET_UP";

export interface RecordSaleContext {
  now: number;
  settings: Settings;
  email: EmailProvider | null;
}

export type RecordSaleResult =
  | {
      ok: true;
      /** True when this sale had already been recorded, so nothing changed (a retry from a flaky connection). */
      duplicate: boolean;
      sale: SaleDetail;
      /** Pieces that are also listed on Etsy and need their listing removed or updated (ETSY-1). */
      etsy: { sku: string; title: string }[];
      receipt: ReceiptOutcome;
    }
  | SaleError;

async function findByKey(db: Db, key: string): Promise<string | null> {
  const row = await db.select({ id: sales.id }).from(sales).where(eq(sales.idempotencyKey, key)).get();
  return row?.id ?? null;
}

async function nextSaleNumber(db: Db): Promise<number> {
  const rows = await db.all<{ n: number }>(sql`UPDATE counter SET next_value = next_value + 1 WHERE key = 'sale' RETURNING next_value - 1 AS n`);
  const n = rows[0]?.n;
  if (n === undefined) throw new Error("The sale counter is missing. Run the database migrations.");
  return n;
}

/**
 * Records a sale: the sale, its lines, the payment and every stock change commit together or not at all (SALE-2).
 * Prices always come from the database, so a changed or tampered price on the phone can't change what is recorded. A discount
 * is the only way to charge less, and it needs a reason (POS-5). Sending the same idempotency key again returns the first
 * sale and changes nothing.
 */
export async function recordSale(db: Db, actor: Actor, input: SaleInput, ctx: RecordSaleContext): Promise<RecordSaleResult> {
  if (!actor.id) return fail("FORBIDDEN", "Sign in to record a sale.");

  const again = await findByKey(db, input.idempotencyKey);
  if (again) return replay(db, again);

  if (!ctx.settings.paymentMethods.includes(input.paymentMethod)) return fail("INVALID", "That payment method isn't turned on.");

  // The same piece twice becomes one line.
  const wanted = new Map<string, number>();
  for (const line of input.items) wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
  const found = await db
    .select({ id: products.id, sku: products.sku, title: products.title, priceCents: products.priceCents, status: products.status, quantity: products.quantity, listedOnEtsy: products.listedOnEtsy })
    .from(products)
    .where(inArray(products.id, [...wanted.keys()]))
    .all();
  const byId = new Map(found.map((p) => [p.id, p]));

  const problems: string[] = [];
  for (const [productId, quantity] of wanted) {
    const p = byId.get(productId);
    if (!p) problems.push("A piece in this sale no longer exists.");
    else if (!SELLABLE_STATUSES.includes(p.status)) problems.push(`${p.title} (${p.sku}) can't be sold because it is ${STATUS_WORDS[p.status]}.`);
    else if (p.quantity < quantity) problems.push(p.quantity === 0 ? `${p.title} (${p.sku}) is out of stock.` : `Only ${p.quantity} of ${p.title} (${p.sku}) left.`);
  }
  if (problems.length) return fail("CONFLICT", problems.join(" "));

  const lines = [...wanted].map(([productId, quantity]) => ({ product: byId.get(productId)!, quantity }));
  const totals = saleTotals(lines.map((l) => ({ priceCents: l.product.priceCents, quantity: l.quantity })), input.discountCents);
  if (!totals.ok) return fail("INVALID", totals.message);

  if (input.eventId) {
    const event = await db.select({ id: events.id }).from(events).where(eq(events.id, input.eventId)).get();
    if (!event) return fail("NOT_FOUND", "That event doesn't exist.");
  }

  const statements: Batchable[] = [];
  let customerId = input.customerId ?? null;
  if (customerId) {
    const c = await db.select({ id: customers.id, anonymizedAt: customers.anonymizedAt }).from(customers).where(eq(customers.id, customerId)).get();
    if (!c || c.anonymizedAt) return fail("NOT_FOUND", "That customer doesn't exist.");
  } else if (input.newCustomer) {
    const email = input.newCustomer.email.trim();
    const existing = email ? await findCustomerByEmail(db, email) : null;
    if (existing) customerId = existing;
    else {
      const created = createCustomerStatement(db, input.newCustomer, "POS");
      customerId = created.id;
      statements.push(created.statement);
    }
  }

  const saleId = newId();
  const number = await nextSaleNumber(db);
  const occurredAt = resolveOccurredAt(input.occurredAt, ctx.now);
  const to = input.receiptEmail?.trim() || null;

  statements.push(
    db.insert(sales).values({
      id: saleId,
      number,
      channel: input.channel,
      customerId,
      eventId: input.eventId ?? null,
      soldByUserId: actor.id,
      status: "COMPLETED",
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      discountReason: input.discountReason,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      occurredAt: new Date(occurredAt),
    }),
    db.insert(saleItems).values(
      lines.map((l) => ({ id: newId(), saleId, productId: l.product.id, quantity: l.quantity, priceCentsSnapshot: l.product.priceCents, titleSnapshot: l.product.title, skuSnapshot: l.product.sku })),
    ),
    db.insert(payments).values({ id: newId(), saleId, method: input.paymentMethod, provider: "NONE", amountCents: totals.totalCents, status: "RECORDED" }),
    ...lines.flatMap((l) => saleLineStatements(db, { productId: l.product.id, fromStatus: l.product.status, quantity: l.quantity, saleId, eventId: input.eventId }, actor)),
    auditStatement(db, {
      userId: actor.id,
      action: "sale.record",
      entityType: "sale",
      entityId: saleId,
      diff: {
        number,
        channel: input.channel,
        totalCents: totals.totalCents,
        discountCents: totals.discountCents,
        discountReason: input.discountReason || undefined,
        source: actor.source,
        items: lines.map((l) => ({ sku: l.product.sku, quantity: l.quantity, priceCents: l.product.priceCents })),
      },
    }),
  );

  try {
    const error = await runGuarded(db, statements);
    if (error) return fail("CONFLICT", error.message);
  } catch (error) {
    // Two requests with the same key at once: the second one loses the unique index and gets the first one's sale.
    if (/UNIQUE constraint failed: sale\.idempotency_key/i.test(String(error) + String((error as { cause?: unknown })?.cause ?? ""))) {
      const winner = await findByKey(db, input.idempotencyKey);
      if (winner) return replay(db, winner);
    }
    throw error;
  }

  const sale = (await getSale(db, saleId))!;
  const receipt = to ? await sendReceipt(ctx, sale, to) : "NONE";
  return { ok: true, duplicate: false, sale, etsy: lines.filter((l) => l.product.listedOnEtsy).map((l) => ({ sku: l.product.sku, title: l.product.title })), receipt };
}

async function replay(db: Db, saleId: string): Promise<RecordSaleResult> {
  const sale = await getSale(db, saleId);
  if (!sale) return fail("NOT_FOUND", "That sale doesn't exist.");
  return { ok: true, duplicate: true, sale, etsy: [], receipt: "NONE" };
}

/** Emails a receipt. Never throws: a receipt that can't be sent must not undo a sale that has happened. */
export async function sendReceipt(ctx: Pick<RecordSaleContext, "settings" | "email">, sale: SaleDetail, to: string): Promise<ReceiptOutcome> {
  if (!ctx.email) return "NOT_SET_UP";
  const from = ctx.settings.systemFromEmail.trim();
  if (!from) return "NOT_SET_UP";
  try {
    const result = await ctx.email.send(
      saleReceipt(
        {
          number: sale.number,
          occurredAt: sale.occurredAt,
          items: sale.items,
          subtotalCents: sale.subtotalCents,
          discountCents: sale.discountCents,
          taxCents: sale.taxCents,
          totalCents: sale.totalCents,
          paymentMethod: sale.paymentMethod,
        },
        { businessName: ctx.settings.businessName, from, replyTo: ctx.settings.replyToEmail.trim() || undefined, to, idempotencyKey: `receipt-${sale.id}-${to.toLowerCase()}` },
      ),
    );
    if (!result.ok) console.error(JSON.stringify({ event: "receipt-email-failed", saleId: sale.id, error: result.error }));
    return result.ok ? "SENT" : "FAILED";
  } catch (error) {
    console.error(JSON.stringify({ event: "receipt-email-error", saleId: sale.id, message: String(error) }));
    return "FAILED";
  }
}

// ---------------------------------------------------------------------------
// Voiding a sale (POS-12)
// ---------------------------------------------------------------------------

export async function voidSale(db: Db, actor: Actor, saleId: string, reason: string, now: number): Promise<{ ok: true } | SaleError> {
  if (!actor.id) return fail("FORBIDDEN", "Sign in to undo a sale.");
  if (!reason.trim()) return fail("INVALID", "Please add a short reason for undoing this sale.");

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return fail("NOT_FOUND", "That sale doesn't exist.");
  if (sale.status === "VOIDED") return fail("CONFLICT", "That sale has already been undone.");
  if (!canVoidSale(actor.role, sale.occurredAt.getTime(), now)) return fail("FORBIDDEN", "Staff can only undo a sale made today. Please ask the owner.");

  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  const current = await db
    .select({ id: products.id, status: products.status })
    .from(products)
    .where(inArray(products.id, items.map((i) => i.productId)))
    .all();
  const statusOf = new Map(current.map((p) => [p.id, p.status]));
  const stillAtEvent = new Set<string>();
  if (sale.eventId) {
    const links = await db
      .select({ productId: eventProducts.productId })
      .from(eventProducts)
      .where(and(eq(eventProducts.eventId, sale.eventId), isNull(eventProducts.releasedAt), inArray(eventProducts.productId, items.map((i) => i.productId))))
      .all();
    for (const l of links) stillAtEvent.add(l.productId);
  }

  const trimmed = reason.trim();
  const error = await runGuarded(db, [
    ...items.flatMap((i) =>
      voidLineStatements(
        db,
        { productId: i.productId, fromStatus: statusOf.get(i.productId) ?? "SOLD", quantity: i.quantity, saleId, eventId: sale.eventId, restoreStatus: stillAtEvent.has(i.productId) ? "AT_EVENT" : "AVAILABLE" },
        actor,
      ),
    ),
    db.update(sales).set({ status: "VOIDED", voidedAt: new Date(now), voidedByUserId: actor.id, voidReason: trimmed }).where(and(eq(sales.id, saleId), eq(sales.status, "COMPLETED"))),
    db.update(payments).set({ status: "REFUNDED" }).where(eq(payments.saleId, saleId)),
    auditStatement(db, { userId: actor.id, action: "sale.void", entityType: "sale", entityId: saleId, diff: { number: sale.number, reason: trimmed, totalCents: sale.totalCents, source: actor.source } }),
  ]);
  return error ? fail("CONFLICT", error.message) : { ok: true };
}

// ---------------------------------------------------------------------------
// Summaries (SALE-4, POS-14, SALE-6)
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  count: number;
  totalCents: number;
}

export interface SalesSummary {
  periods: Record<SalePeriod, PeriodTotals>;
  byChannel: { channel: SaleChannel; count: number; totalCents: number }[];
  byEvent: { eventId: string | null; title: string; count: number; totalCents: number }[];
  /** The period the two breakdowns above cover. */
  breakdownPeriod: SalePeriod;
}

/** Completed sales only: an undone sale is not revenue. */
export async function salesSummary(db: Db, now: number, opts: { breakdown?: SalePeriod; soldByUserId?: string } = {}): Promise<SalesSummary> {
  const breakdownPeriod = opts.breakdown ?? "month";
  const mine = opts.soldByUserId ? sql`AND sold_by_user_id = ${opts.soldByUserId}` : sql``;
  const starts = Object.fromEntries(SALE_PERIODS.map((p) => [p, periodStartMs(p, now)])) as Record<SalePeriod, number>;
  const per = (p: SalePeriod) => sql`SELECT ${p} AS period, COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents FROM sale WHERE status = 'COMPLETED' AND occurred_at >= ${starts[p]} ${mine}`;
  const [periodRows, byChannel, byEvent] = await Promise.all([
    db.all<{ period: SalePeriod; n: number; cents: number }>(sql.join(SALE_PERIODS.map(per), sql` UNION ALL `)),
    db.all<{ channel: SaleChannel; n: number; cents: number }>(
      sql`SELECT channel, COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents FROM sale WHERE status = 'COMPLETED' AND occurred_at >= ${starts[breakdownPeriod]} ${mine} GROUP BY channel ORDER BY cents DESC`,
    ),
    db.all<{ event_id: string | null; title: string | null; n: number; cents: number }>(
      sql`SELECT s.event_id AS event_id, e.title AS title, COUNT(*) AS n, COALESCE(SUM(s.total_cents), 0) AS cents FROM sale s LEFT JOIN event e ON e.id = s.event_id
        WHERE s.status = 'COMPLETED' AND s.occurred_at >= ${starts[breakdownPeriod]} ${opts.soldByUserId ? sql`AND s.sold_by_user_id = ${opts.soldByUserId}` : sql``} GROUP BY s.event_id ORDER BY cents DESC`,
    ),
  ]);
  const periods = Object.fromEntries(SALE_PERIODS.map((p) => [p, { count: 0, totalCents: 0 }])) as Record<SalePeriod, PeriodTotals>;
  for (const r of periodRows) periods[r.period] = { count: r.n, totalCents: r.cents };
  return {
    periods,
    breakdownPeriod,
    byChannel: byChannel.map((r) => ({ channel: r.channel, count: r.n, totalCents: r.cents })),
    byEvent: byEvent.map((r) => ({ eventId: r.event_id, title: r.title ?? "Not at an event", count: r.n, totalCents: r.cents })),
  };
}

/** The last 12 months of completed sales against the small-supplier limit (SALE-6). ADMIN only. */
export async function loadThreshold(db: Db, now: number, settings: Pick<Settings, "smallSupplierThresholdCents" | "taxRegistered">): Promise<ThresholdStatus & { taxRegistered: boolean; sinceMs: number }> {
  const sinceMs = trailingYearStartMs(now);
  const row = await db.all<{ cents: number }>(sql`SELECT COALESCE(SUM(total_cents), 0) AS cents FROM sale WHERE status = 'COMPLETED' AND occurred_at >= ${sinceMs}`);
  return { ...thresholdStatus(row[0]?.cents ?? 0, settings.smallSupplierThresholdCents), taxRegistered: settings.taxRegistered, sinceMs };
}

export interface DaySummary {
  dayStartMs: number;
  count: number;
  totalCents: number;
  itemsSold: number;
  voidedCount: number;
  byMethod: { method: PaymentMethod; count: number; totalCents: number }[];
}

/** One local day, for the end-of-day screen (POS-14). `soldByUserId` limits it to one person's sales. */
export async function daySummary(db: Db, now: number, opts: { soldByUserId?: string } = {}): Promise<DaySummary> {
  const from = periodStartMs("today", now);
  const to = nextDayStartMs(from);
  const mine = opts.soldByUserId ? sql`AND s.sold_by_user_id = ${opts.soldByUserId}` : sql``;
  const [totals, methods, items] = await Promise.all([
    db.all<{ done: number; cents: number; voided: number }>(
      sql`SELECT SUM(CASE WHEN s.status = 'COMPLETED' THEN 1 ELSE 0 END) AS done, COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_cents ELSE 0 END), 0) AS cents, SUM(CASE WHEN s.status = 'VOIDED' THEN 1 ELSE 0 END) AS voided
        FROM sale s WHERE s.occurred_at >= ${from} AND s.occurred_at < ${to} ${mine}`,
    ),
    db.all<{ method: PaymentMethod; n: number; cents: number }>(
      sql`SELECT p.method AS method, COUNT(*) AS n, COALESCE(SUM(p.amount_cents), 0) AS cents FROM payment p JOIN sale s ON s.id = p.sale_id
        WHERE s.status = 'COMPLETED' AND s.occurred_at >= ${from} AND s.occurred_at < ${to} ${mine} GROUP BY p.method ORDER BY cents DESC`,
    ),
    db.all<{ n: number }>(
      sql`SELECT COALESCE(SUM(si.quantity), 0) AS n FROM sale_item si JOIN sale s ON s.id = si.sale_id WHERE s.status = 'COMPLETED' AND s.occurred_at >= ${from} AND s.occurred_at < ${to} ${mine}`,
    ),
  ]);
  const t = totals[0];
  return {
    dayStartMs: from,
    count: t?.done ?? 0,
    totalCents: t?.cents ?? 0,
    voidedCount: t?.voided ?? 0,
    itemsSold: items[0]?.n ?? 0,
    byMethod: methods.map((m) => ({ method: m.method, count: m.n, totalCents: m.cents })),
  };
}
