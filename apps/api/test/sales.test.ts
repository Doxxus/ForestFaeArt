import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { auditLog, customers, eq, inventoryTransactions, products, sales, sql, users } from "@ffa/db";
import {
  SALE_LIMITS,
  canVoidSale,
  csvCell,
  localToUtcMs,
  periodStartMs,
  resolveOccurredAt,
  saleInputSchema,
  saleTotals,
  thresholdStatus,
  type SaleInput,
} from "@ffa/validators";
import type { Env } from "../src/env";
import type { EmailMessage, EmailProvider } from "../src/email/provider";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
import { makeDb, type Db } from "../src/store";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
let env: Env;
let admin: ReturnType<typeof as>;
let staff: ReturnType<typeof as>;
let pos: ReturnType<typeof as>;
const sent: EmailMessage[] = [];
const mailer: EmailProvider = {
  async send(m) {
    sent.push(m);
    return { ok: true, id: "m1" };
  },
};

function as(token?: string, opts: { pos?: boolean; email?: EmailProvider | null } = {}) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (opts.pos) headers.set("x-ffa-client", "pos");
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers }), { email: opts.email === undefined ? mailer : opts.email }));
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

const DAY = 24 * 3600_000;
let keyCounter = 0;
const key = () => `test-key-${String(++keyCounter).padStart(6, "0")}-xxxx`;

async function piece(title: string, priceCents = 4500, quantity = 1, status: "AVAILABLE" | "DRAFT" = "AVAILABLE") {
  const p = await admin.products.create({ title, priceCents, quantity });
  if (status === "AVAILABLE") await admin.products.changeStatus({ productId: p.id, to: "AVAILABLE" });
  return p;
}
const row = async (id: string) => (await db.select().from(products).where(eq(products.id, id)).get())!;
const sale = (items: { productId: string; quantity?: number }[], extra: Partial<SaleInput> = {}) =>
  ({ idempotencyKey: key(), channel: "MARKET", items: items.map((i) => ({ productId: i.productId, quantity: i.quantity ?? 1 })), paymentMethod: "CASH", discountCents: 0, discountReason: "", notes: "", ...extra }) as SaleInput;

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "https://web.test" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "Asa", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "Sam", role: "STAFF", passwordHash: hash },
  ]);
  const login = async (email: string) => (await as().auth.login({ email, password: "correct horse battery staple" })).token;
  const adminToken = await login("a@example.com");
  const staffToken = await login("s@example.com");
  admin = as(adminToken);
  staff = as(staffToken);
  pos = as(staffToken, { pos: true });
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

describe("sale rules (pure)", () => {
  it("adds up lines and the discount, with no tax", () => {
    expect(saleTotals([{ priceCents: 4500, quantity: 2 }, { priceCents: 1000, quantity: 1 }], 500)).toEqual({ ok: true, subtotalCents: 10_000, discountCents: 500, taxCents: 0, totalCents: 9500 });
    expect(saleTotals([{ priceCents: 1000, quantity: 1 }], 1001)).toMatchObject({ ok: false });
    expect(saleTotals([{ priceCents: 1000, quantity: 1 }], -1)).toMatchObject({ ok: false });
  });
  it("requires a reason for a discount, and refuses a customer chosen two ways", () => {
    const base = { idempotencyKey: "abcdefgh", items: [{ productId: "P", quantity: 1 }], paymentMethod: "CASH" };
    expect(saleInputSchema.safeParse({ ...base, discountCents: 100 }).success).toBe(false);
    expect(saleInputSchema.safeParse({ ...base, discountCents: 100, discountReason: "Friend" }).success).toBe(true);
    expect(saleInputSchema.safeParse({ ...base, customerId: "C", newCustomer: { firstName: "A" } }).success).toBe(false);
    expect(saleInputSchema.safeParse({ ...base, newCustomer: {} }).success).toBe(false);
    expect(saleInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });
  it("trusts a phone's time only when it is plausible", () => {
    const now = Date.now();
    expect(resolveOccurredAt(undefined, now)).toBe(now);
    expect(resolveOccurredAt(now - 3600_000, now)).toBe(now - 3600_000);
    expect(resolveOccurredAt(now + 3600_000, now)).toBe(now);
    expect(resolveOccurredAt(now - SALE_LIMITS.maxBackdateMs - 1, now)).toBe(now);
    expect(resolveOccurredAt(now + 1000, now)).toBe(now);
  });
  it("lets staff void only a sale from today (shop time), and the administrator any sale", () => {
    const now = localToUtcMs("2026-11-20T15:00", "America/Toronto")!;
    expect(canVoidSale("STAFF", localToUtcMs("2026-11-20T00:05", "America/Toronto")!, now)).toBe(true);
    expect(canVoidSale("STAFF", localToUtcMs("2026-11-19T23:55", "America/Toronto")!, now)).toBe(false);
    expect(canVoidSale("ADMIN", now - 40 * DAY, now)).toBe(true);
  });
  it("starts periods at midnight in the shop's zone, with weeks starting Monday", () => {
    const wed = localToUtcMs("2026-11-18T15:00", "America/Toronto")!;
    expect(periodStartMs("today", wed)).toBe(localToUtcMs("2026-11-18T00:00", "America/Toronto"));
    expect(periodStartMs("week", wed)).toBe(localToUtcMs("2026-11-16T00:00", "America/Toronto"));
    expect(periodStartMs("month", wed)).toBe(localToUtcMs("2026-11-01T00:00", "America/Toronto"));
    expect(periodStartMs("year", wed)).toBe(localToUtcMs("2026-01-01T00:00", "America/Toronto"));
  });
  it("warns at 80% and at 100% of the small-supplier limit", () => {
    expect(thresholdStatus(2_000_000, 3_000_000)).toMatchObject({ percent: 66, level: "ok" });
    expect(thresholdStatus(2_400_000, 3_000_000)).toMatchObject({ percent: 80, level: "warn" });
    expect(thresholdStatus(3_000_000, 3_000_000)).toMatchObject({ percent: 100, level: "over" });
  });
  it("defuses spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("Moth")).toBe("Moth");
  });
});

describe("recording a sale (SALE-2, POS-2)", () => {
  it("records the sale, payment, stock change and ledger row together", async () => {
    const p = await piece("Morpho Frame", 12_000);
    const r = await pos.sales.record(sale([{ productId: p.id }]));
    expect(r.duplicate).toBe(false);
    expect(r.sale).toMatchObject({ status: "COMPLETED", channel: "MARKET", subtotalCents: 12_000, discountCents: 0, taxCents: 0, totalCents: 12_000, paymentMethod: "CASH", soldByName: "Sam" });
    expect(r.sale.items).toEqual([expect.objectContaining({ sku: p.sku, title: "Morpho Frame", quantity: 1, priceCents: 12_000 })]);
    expect(r.sale.payment).toMatchObject({ method: "CASH", amountCents: 12_000, provider: "NONE", status: "RECORDED" });
    expect(await row(p.id)).toMatchObject({ status: "SOLD", quantity: 0 });
    const ledger = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.saleId, r.sale.id)).all();
    expect(ledger).toEqual([expect.objectContaining({ productId: p.id, fromStatus: "AVAILABLE", toStatus: "SOLD", quantityDelta: -1, quantityAfter: 0, source: "POS" })]);
  });

  it("numbers sales in order", async () => {
    const a = await pos.sales.record(sale([{ productId: (await piece("N1")).id }]));
    const b = await pos.sales.record(sale([{ productId: (await piece("N2")).id }]));
    expect(b.sale.number).toBe(a.sale.number + 1);
  });

  it("never sells the same piece twice", async () => {
    const p = await piece("Only One");
    await pos.sales.record(sale([{ productId: p.id }]));
    const second = await rejection(pos.sales.record(sale([{ productId: p.id }])));
    expect(second.code).toBe("CONFLICT");
    expect(second.message).toMatch(/Only One.*already sold/);
    expect(await row(p.id)).toMatchObject({ status: "SOLD", quantity: 0 });
  });

  it("takes a retry with the same key as the same sale, without selling anything twice", async () => {
    const p = await piece("Retry Me", 1000, 3);
    const input = sale([{ productId: p.id, quantity: 1 }]);
    const first = await pos.sales.record(input);
    const again = await pos.sales.record(input);
    expect(again.duplicate).toBe(true);
    expect(again.sale.id).toBe(first.sale.id);
    expect(await row(p.id)).toMatchObject({ quantity: 2, status: "AVAILABLE" });
  });

  it("handles two identical requests arriving at once", async () => {
    const p = await piece("Race", 1000, 5);
    const input = sale([{ productId: p.id }]);
    const results = await Promise.allSettled([pos.sales.record(input), pos.sales.record(input), pos.sales.record(input)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => (r as PromiseFulfilledResult<{ sale: { id: string } }>).value.sale.id)).size).toBe(1);
    expect(await row(p.id)).toMatchObject({ quantity: 4 });
  });

  it("sells several units of a piece that has stock, and stops at what's left", async () => {
    const p = await piece("Cards", 500, 5);
    await pos.sales.record(sale([{ productId: p.id, quantity: 3 }]));
    expect(await row(p.id)).toMatchObject({ quantity: 2, status: "AVAILABLE" });
    const over = await rejection(pos.sales.record(sale([{ productId: p.id, quantity: 3 }])));
    expect(over.message).toMatch(/Only 2 of Cards/);
    await pos.sales.record(sale([{ productId: p.id, quantity: 2 }]));
    expect(await row(p.id)).toMatchObject({ quantity: 0, status: "SOLD" });
  });

  it("sells a cart as one sale with one payment, and changes nothing if any line fails", async () => {
    const a = await piece("Cart A", 1000);
    const b = await piece("Cart B", 2500);
    const gone = await piece("Cart Gone", 700);
    await pos.sales.record(sale([{ productId: gone.id }]));
    const bad = await rejection(pos.sales.record(sale([{ productId: a.id }, { productId: gone.id }])));
    expect(bad.code).toBe("CONFLICT");
    expect(await row(a.id)).toMatchObject({ status: "AVAILABLE", quantity: 1 });

    const ok = await pos.sales.record(sale([{ productId: a.id }, { productId: b.id }], { discountCents: 350, discountReason: "Bought two" }));
    expect(ok.sale).toMatchObject({ subtotalCents: 3500, discountCents: 350, totalCents: 3150, itemCount: 2, discountReason: "Bought two" });
    expect(ok.sale.payment?.amountCents).toBe(3150);
    expect(await row(a.id)).toMatchObject({ status: "SOLD" });
    expect(await row(b.id)).toMatchObject({ status: "SOLD" });
  });

  it("merges the same piece listed twice into one line", async () => {
    const p = await piece("Twice", 500, 4);
    const r = await pos.sales.record(sale([{ productId: p.id }, { productId: p.id, quantity: 2 }]));
    expect(r.sale.items).toHaveLength(1);
    expect(r.sale.items[0]?.quantity).toBe(3);
  });

  it("uses the price in the database, never one sent by the phone", async () => {
    const p = await piece("Priced", 8000);
    const r = await pos.sales.record({ ...sale([{ productId: p.id }]), items: [{ productId: p.id, quantity: 1, priceCents: 1 } as never] });
    expect(r.sale.totalCents).toBe(8000);
  });

  it("rejects pieces that can't be sold", async () => {
    const draft = await piece("A Draft", 1000, 1, "DRAFT");
    const archived = await piece("Archived One");
    await admin.products.changeStatus({ productId: archived.id, to: "ARCHIVED" });
    expect((await rejection(pos.sales.record(sale([{ productId: draft.id }])))).message).toMatch(/still a draft/);
    expect((await rejection(pos.sales.record(sale([{ productId: archived.id }])))).message).toMatch(/archived/);
    expect((await rejection(pos.sales.record(sale([{ productId: "NOPE" }])))).message).toMatch(/no longer exists/);
  });

  it("refuses a discount bigger than the total, and a payment method that is turned off", async () => {
    const p = await piece("Discounted", 1000);
    expect((await rejection(pos.sales.record(sale([{ productId: p.id }], { discountCents: 2000, discountReason: "x" })))).code).toBe("BAD_REQUEST");
    await admin.settings.update({ paymentMethods: ["CASH", "CARD"] });
    expect((await rejection(pos.sales.record(sale([{ productId: p.id }], { paymentMethod: "E_TRANSFER" })))).message).toMatch(/isn't turned on/);
    await admin.settings.update({ paymentMethods: ["CASH", "CARD", "E_TRANSFER", "OTHER"] });
    expect((await pos.sales.record(sale([{ productId: p.id }], { paymentMethod: "E_TRANSFER" }))).sale.paymentMethod).toBe("E_TRANSFER");
  });

  it("lets a reserved piece be sold and ends the reservation", async () => {
    const p = await piece("Held");
    await admin.products.changeStatus({ productId: p.id, to: "RESERVED", reason: "for Jo" });
    await db.update(products).set({ reservedNote: "Jo, Saturday" }).where(eq(products.id, p.id));
    await pos.sales.record(sale([{ productId: p.id }]));
    expect(await row(p.id)).toMatchObject({ status: "SOLD", reservedNote: null, reservedCustomerId: null });
  });

  it("reminds about Etsy when the piece is also listed there (ETSY-1)", async () => {
    const p = await piece("Etsy Moth");
    await admin.products.update({ productId: p.id, listedOnEtsy: true });
    const r = await pos.sales.record(sale([{ productId: p.id }], { channel: "ETSY" }));
    expect(r.etsy).toEqual([{ sku: p.sku, title: "Etsy Moth" }]);
    expect(r.sale.channel).toBe("ETSY");
    expect((await pos.sales.record(sale([{ productId: (await piece("Plain")).id }]))).etsy).toEqual([]);
  });

  it("keeps the time the sale really happened, within reason", async () => {
    const earlier = Date.now() - 2 * 3600_000;
    const r = await pos.sales.record(sale([{ productId: (await piece("Offline Sale")).id }], { occurredAt: earlier }));
    expect(r.sale.occurredAt).toBe(earlier);
    const odd = await pos.sales.record(sale([{ productId: (await piece("Clock Wrong")).id }], { occurredAt: Date.now() + 5 * DAY }));
    expect(odd.sale.occurredAt).toBeLessThanOrEqual(Date.now());
  });

  it("records who sold it and writes an audit entry", async () => {
    const p = await piece("Audited", 3000);
    const r = await pos.sales.record(sale([{ productId: p.id }], { discountCents: 500, discountReason: "Display wear" }));
    const entry = await db.select().from(auditLog).where(eq(auditLog.entityId, r.sale.id)).get();
    expect(entry).toMatchObject({ action: "sale.record", userId: "U_S" });
    expect(entry?.diff).toContain("Display wear");
  });

  it("needs a signed-in user", async () => {
    expect((await rejection(as().sales.record(sale([{ productId: "x" }])))).code).toBe("UNAUTHORIZED");
  });
});

describe("customers at a sale (POS-6, CUS-1)", () => {
  it("creates a customer with the sale, and reuses one with the same email", async () => {
    const a = await pos.sales.record(sale([{ productId: (await piece("C1")).id }], { newCustomer: { firstName: "Jo", lastName: "Park", email: "Jo@Example.com", phone: "", notes: "", marketingConsent: true } }));
    expect(a.sale.customerName).toBe("Jo Park");
    const b = await pos.sales.record(sale([{ productId: (await piece("C2")).id }], { newCustomer: { firstName: "Joanne", lastName: "", email: "jo@example.com", phone: "", notes: "", marketingConsent: false } }));
    expect(b.sale.customerId).toBe(a.sale.customerId);
    const c = await db.select().from(customers).where(eq(customers.id, a.sale.customerId!)).get();
    expect(c).toMatchObject({ marketingConsent: true, marketingConsentSource: "POS" });
    expect(c?.marketingConsentAt).toBeInstanceOf(Date);
  });
  it("does not need a customer, and fails the whole sale if the customer is wrong", async () => {
    const p = await piece("C3");
    expect((await pos.sales.record(sale([{ productId: p.id }]))).sale.customerId).toBeNull();
    const p2 = await piece("C4");
    expect((await rejection(pos.sales.record(sale([{ productId: p2.id }], { customerId: "NOPE" })))).code).toBe("NOT_FOUND");
    expect(await row(p2.id)).toMatchObject({ status: "AVAILABLE" });
  });
  it("lets staff search by name, email or phone, but shows no spending", async () => {
    await staff.customers.create({ firstName: "Mina", lastName: "Okafor", email: "mina@example.com", phone: "(613) 555-0142", notes: "", marketingConsent: false });
    for (const q of ["okaf", "MINA@exa", "613555", "555-0142"]) {
      const hits = await staff.customers.search({ q });
      expect(hits.map((h) => h.name)).toContain("Mina Okafor");
    }
    expect(Object.keys((await staff.customers.search({ q: "Mina" }))[0]!).sort()).toEqual(["email", "id", "name", "phone"]);
    expect(await staff.customers.search({ q: "m" })).toEqual([]);
  });
  it("refuses a second customer with the same email when added directly", async () => {
    expect((await rejection(admin.customers.create({ firstName: "Other", lastName: "", email: "MINA@example.com", phone: "", notes: "", marketingConsent: false }))).code).toBe("CONFLICT");
  });
  it("keeps customer pages and exports for the administrator", async () => {
    expect((await rejection(staff.customers.list({}))).code).toBe("FORBIDDEN");
    expect((await rejection(staff.customers.exportCsv())).code).toBe("FORBIDDEN");
  });
  it("shows purchase history, exports to CSV safely, and anonymises on request (CUS-3, CUS-5)", async () => {
    const created = await admin.customers.create({ firstName: "=Evil", lastName: "Name", email: "evil@example.com", phone: "", notes: "", marketingConsent: false });
    await pos.sales.record(sale([{ productId: (await piece("Evil Buy", 2000)).id }], { customerId: created.id }));
    const detail = await admin.customers.get({ id: created.id });
    expect(detail.customer).toMatchObject({ purchases: 1, spentCents: 2000 });
    expect(detail.sales).toHaveLength(1);

    const csv = await admin.customers.exportCsv();
    expect(csv).toContain("'=Evil");
    expect(csv.split("\r\n")[0]).toContain("Marketing consent");

    await admin.customers.anonymize({ id: created.id });
    const after = await admin.customers.get({ id: created.id });
    expect(after.customer).toMatchObject({ anonymized: true, name: "Anonymised customer", email: null, firstName: "", purchases: 1 });
    expect((await admin.customers.exportCsv())).not.toContain("evil@example.com");
    expect((await rejection(admin.customers.anonymize({ id: created.id }))).code).toBe("CONFLICT");
    expect((await rejection(admin.customers.update({ id: created.id, fields: { firstName: "X", lastName: "", email: "", phone: "", notes: "", marketingConsent: false } }))).code).toBe("BAD_REQUEST");
  });
  it("records consent changes with a date and source", async () => {
    const c = await admin.customers.create({ firstName: "Consent", lastName: "Test", email: "", phone: "", notes: "", marketingConsent: false });
    await admin.customers.update({ id: c.id, fields: { firstName: "Consent", lastName: "Test", email: "", phone: "", notes: "", marketingConsent: true } });
    expect((await admin.customers.get({ id: c.id })).customer).toMatchObject({ marketingConsent: true, marketingConsentSource: "ADMIN" });
  });
});

describe("undoing a sale (POS-12)", () => {
  it("puts the piece back, marks the sale voided and logs it", async () => {
    const p = await piece("Undo Me", 3000);
    const r = await pos.sales.record(sale([{ productId: p.id }]));
    await pos.sales.void({ saleId: r.sale.id, reason: "Customer changed their mind" });
    expect(await row(p.id)).toMatchObject({ status: "AVAILABLE", quantity: 1 });
    const after = await pos.sales.get({ id: r.sale.id });
    expect(after).toMatchObject({ status: "VOIDED", voidReason: "Customer changed their mind", voidedByName: "Sam" });
    expect(after.payment?.status).toBe("REFUNDED");
    const ledger = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.saleId, r.sale.id)).all();
    expect(ledger.map((l) => l.quantityDelta).sort()).toEqual([-1, 1]);
    expect((await db.select().from(auditLog).where(eq(auditLog.entityId, r.sale.id)).all()).map((a) => a.action).sort()).toEqual(["sale.record", "sale.void"]);
    // And it can be sold again.
    await pos.sales.record(sale([{ productId: p.id }]));
  });
  it("restores several units of a multi-quantity piece", async () => {
    const p = await piece("Undo Many", 500, 4);
    const r = await pos.sales.record(sale([{ productId: p.id, quantity: 3 }]));
    await pos.sales.void({ saleId: r.sale.id, reason: "Mistake" });
    expect(await row(p.id)).toMatchObject({ quantity: 4, status: "AVAILABLE" });
  });
  it("returns a piece that is still out at the event to AT_EVENT", async () => {
    const p = await piece("Undo At Event");
    const event = await admin.events.create({ title: "Undo Fair", startsAt: Date.now() - 3600_000, endsAt: Date.now() + 3600_000 } as Parameters<typeof admin.events.create>[0]);
    await admin.events.assign({ eventId: event.id, productIds: [p.id] });
    expect(await row(p.id)).toMatchObject({ status: "AT_EVENT" });
    const r = await pos.sales.record(sale([{ productId: p.id }], { eventId: event.id }));
    expect(r.sale.eventTitle).toBe("Undo Fair");
    await pos.sales.void({ saleId: r.sale.id, reason: "Wrong piece" });
    expect(await row(p.id)).toMatchObject({ status: "AT_EVENT", quantity: 1 });
  });
  it("can't be undone twice, so stock is never restored twice", async () => {
    const p = await piece("Undo Twice", 500, 2);
    const r = await pos.sales.record(sale([{ productId: p.id, quantity: 1 }]));
    const results = await Promise.allSettled([pos.sales.void({ saleId: r.sale.id, reason: "a" }), pos.sales.void({ saleId: r.sale.id, reason: "b" })]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await row(p.id)).toMatchObject({ quantity: 2 });
    expect((await rejection(pos.sales.void({ saleId: r.sale.id, reason: "c" }))).code).toBe("CONFLICT");
  });
  it("needs a reason", async () => {
    const r = await pos.sales.record(sale([{ productId: (await piece("Undo No Reason")).id }]));
    expect((await rejection(pos.sales.void({ saleId: r.sale.id, reason: "  " }))).code).toBe("BAD_REQUEST");
  });
  it("lets staff undo only their own sales from today, and the administrator any", async () => {
    const old = await piece("Old Sale");
    const r = await pos.sales.record(sale([{ productId: old.id }], { occurredAt: Date.now() - 3 * DAY }));
    await db.update(sales).set({ occurredAt: new Date(Date.now() - 3 * DAY) }).where(eq(sales.id, r.sale.id));
    const forbidden = await rejection(pos.sales.void({ saleId: r.sale.id, reason: "Late" }));
    expect(forbidden.code).toBe("FORBIDDEN");
    expect(forbidden.message).toMatch(/ask the owner/);
    await admin.sales.void({ saleId: r.sale.id, reason: "Owner approved" });
    expect(await row(old.id)).toMatchObject({ status: "AVAILABLE" });

    const adminsSale = await admin.sales.record(sale([{ productId: (await piece("Owner Sale")).id }]));
    expect((await rejection(pos.sales.void({ saleId: adminsSale.sale.id, reason: "Not mine" }))).code).toBe("NOT_FOUND");
  });
});

describe("reading sales (SALE-3, SALE-4, SALE-6, POS-14)", () => {
  it("lists with filters for the administrator only", async () => {
    expect((await rejection(staff.sales.list({}))).code).toBe("FORBIDDEN");
    const p = await piece("Filtered", 1111);
    const ev = await admin.events.create({ title: "Filter Fair", startsAt: Date.now() - 3600_000, endsAt: Date.now() + 3600_000 } as Parameters<typeof admin.events.create>[0]);
    const r = await pos.sales.record(sale([{ productId: p.id }], { eventId: ev.id, paymentMethod: "CARD", channel: "MARKET" }));
    const hit = await admin.sales.list({ eventId: ev.id, method: "CARD", channel: "MARKET" });
    expect(hit.rows.map((x) => x.id)).toEqual([r.sale.id]);
    expect(hit.totalCents).toBe(1111);
    expect((await admin.sales.list({ eventId: ev.id, method: "CASH" })).total).toBe(0);
    expect((await admin.sales.list({ number: r.sale.number })).rows).toHaveLength(1);
    const today = new Date().toISOString().slice(0, 10);
    expect((await admin.sales.list({ from: today, to: today, eventId: ev.id })).total).toBeGreaterThanOrEqual(0);
    expect((await admin.sales.list({ from: "2000-01-01", to: "2000-01-02" })).total).toBe(0);
  });
  it("exports CSV with money in dollars and formulas defused", async () => {
    const p = await piece("CSV Piece", 2550);
    await pos.sales.record(sale([{ productId: p.id }], { notes: "=cmd|' /C calc'!A0" }));
    const csv = await admin.sales.exportCsv({});
    expect(csv.split("\r\n")[0]).toBe("Number,Date,Status,Channel,Event,Customer,Payment,Items,Subtotal,Discount,Discount reason,Tax,Total,Sold by,Notes");
    expect(csv).toContain("25.50");
    expect(csv).toContain("'=cmd");
    expect((await rejection(staff.sales.exportCsv({}))).code).toBe("FORBIDDEN");
  });
  it("lets staff see only their own sales", async () => {
    const mine = await pos.sales.record(sale([{ productId: (await piece("Mine")).id }]));
    const theirs = await admin.sales.record(sale([{ productId: (await piece("Theirs")).id }]));
    expect((await pos.sales.get({ id: mine.sale.id })).id).toBe(mine.sale.id);
    expect((await rejection(pos.sales.get({ id: theirs.sale.id }))).code).toBe("NOT_FOUND");
    const today = await pos.sales.today();
    expect(today.sales.every((s) => s.soldByName === "Sam")).toBe(true);
    const all = await admin.sales.today();
    expect(all.summary.count).toBeGreaterThan(today.summary.count);
  });
  it("adds up today's takings by payment method, leaving out undone sales", async () => {
    const before = await admin.sales.today();
    const a = await pos.sales.record(sale([{ productId: (await piece("Day A", 1000)).id }], { paymentMethod: "CASH" }));
    await pos.sales.record(sale([{ productId: (await piece("Day B", 2000)).id }], { paymentMethod: "CARD" }));
    await pos.sales.void({ saleId: a.sale.id, reason: "Oops" });
    const after = await admin.sales.today();
    expect(after.summary.totalCents - before.summary.totalCents).toBe(2000);
    expect(after.summary.count - before.summary.count).toBe(1);
    expect(after.summary.voidedCount - before.summary.voidedCount).toBe(1);
    expect(after.summary.byMethod.find((m) => m.method === "CARD")?.totalCents).toBeGreaterThanOrEqual(2000);
  });
  it("summarises by period, channel and event, and tracks the small-supplier limit", async () => {
    const s = await admin.sales.summary({ breakdown: "year" });
    expect(s.periods.today.count).toBeGreaterThan(0);
    expect(s.periods.year.totalCents).toBeGreaterThanOrEqual(s.periods.today.totalCents);
    expect(s.byChannel.length).toBeGreaterThan(0);
    expect(s.byEvent.some((e) => e.title === "Filter Fair")).toBe(true);
    expect(s.threshold).toMatchObject({ thresholdCents: 3_000_000, level: "ok", taxRegistered: false });
    expect(s.threshold.revenueCents).toBe(s.periods.year.totalCents);
    await admin.settings.update({ smallSupplierThresholdCents: Math.max(1, s.threshold.revenueCents) });
    expect((await admin.sales.summary()).threshold.level).toBe("over");
    await admin.settings.update({ smallSupplierThresholdCents: 3_000_000 });
    expect((await rejection(staff.sales.summary())).code).toBe("FORBIDDEN");
  });
});

describe("receipts (POS-11)", () => {
  it("emails a receipt with no tax lines while the owner isn't registered", async () => {
    sent.length = 0;
    const p = await piece("Receipt Moth", 4500);
    const r = await pos.sales.record(sale([{ productId: p.id }], { receiptEmail: "buyer@example.com", discountCents: 500, discountReason: "Friend" }));
    expect(r.receipt).toBe("SENT");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ["buyer@example.com"], subject: expect.stringContaining(`#${r.sale.number}`) });
    expect(sent[0]?.text).toContain("Receipt Moth");
    expect(sent[0]?.text).toContain("Discount: -$5.00");
    expect(sent[0]?.text).toContain("Total: $40.00");
    expect(sent[0]?.text).not.toMatch(/tax/i);
    expect(sent[0]?.html).not.toMatch(/Tax/);
  });
  it("still records the sale when email isn't set up or fails", async () => {
    const quiet = as((await as().auth.login({ email: "s@example.com", password: "correct horse battery staple" })).token, { pos: true, email: null });
    const r = await quiet.sales.record(sale([{ productId: (await piece("No Mail")).id }], { receiptEmail: "buyer@example.com" }));
    expect(r.receipt).toBe("NOT_SET_UP");
    expect(r.sale.status).toBe("COMPLETED");
    const failing = as((await as().auth.login({ email: "s@example.com", password: "correct horse battery staple" })).token, { pos: true, email: { send: async () => ({ ok: false, error: "nope" }) } });
    const r2 = await failing.sales.record(sale([{ productId: (await piece("Bad Mail")).id }], { receiptEmail: "buyer@example.com" }));
    expect(r2.receipt).toBe("FAILED");
    expect(r2.sale.status).toBe("COMPLETED");
  });
  it("can send a receipt afterwards, but not for an undone sale", async () => {
    const r = await pos.sales.record(sale([{ productId: (await piece("Later Receipt")).id }]));
    expect((await pos.sales.sendReceipt({ saleId: r.sale.id, email: "later@example.com" })).outcome).toBe("SENT");
    await pos.sales.void({ saleId: r.sale.id, reason: "x" });
    expect((await rejection(pos.sales.sendReceipt({ saleId: r.sale.id, email: "later@example.com" }))).code).toBe("BAD_REQUEST");
  });
});

describe("what the POS keeps on the phone (POS-10)", () => {
  it("sends pieces, events and settings, and never cost", async () => {
    const p = await admin.products.create({ title: "Pricey", priceCents: 9000, costCents: 4000, quantity: 1 });
    await admin.products.changeStatus({ productId: p.id, to: "AVAILABLE" });
    const ev = await admin.events.create({ title: "Phone Fair", startsAt: Date.now() - 3600_000, endsAt: Date.now() + 3600_000 } as Parameters<typeof admin.events.create>[0]);
    await admin.events.assign({ eventId: ev.id, productIds: [p.id] });
    const catalog = await pos.pos.catalog();
    const found = catalog.pieces.find((x) => x.id === p.id);
    expect(found).toMatchObject({ sku: p.sku, title: "Pricey", priceCents: 9000, status: "AT_EVENT", quantity: 1, eventIds: [ev.id] });
    expect(JSON.stringify(catalog)).not.toMatch(/cost/i);
    expect(catalog.events.some((e) => e.id === ev.id)).toBe(true);
    expect(catalog.activeEventId).not.toBeNull();
    expect(catalog.paymentMethods).toEqual(["CASH", "CARD", "E_TRANSFER", "OTHER"]);
    expect(catalog.businessName).toBe("Forest Fae Folk Art");
    expect(catalog.serverTime).toBeGreaterThan(0);
    expect((await rejection(as().pos.catalog())).code).toBe("UNAUTHORIZED");
  });
  it("includes sold and draft pieces, so a scan can explain why it can't be sold", async () => {
    const sold = await piece("Sold For Scan");
    await pos.sales.record(sale([{ productId: sold.id }]));
    const found = (await pos.pos.catalog()).pieces.find((x) => x.id === sold.id);
    expect(found).toMatchObject({ status: "SOLD", quantity: 0 });
  });
});

describe("the database backstops", () => {
  it("refuses a sale line with no stock behind it, even if the service had a bug", async () => {
    const p = await piece("Backstop");
    await expect(db.run(sql`UPDATE product SET quantity = 0 WHERE id = ${p.id}`)).rejects.toThrow();
  });
});
