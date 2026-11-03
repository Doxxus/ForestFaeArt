import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inventoryTransactions, products, sales, sql } from "@ffa/db";
import { newId } from "@ffa/validators";
import { makeDb, type Db } from "../src/store";
import {
  adjustStock,
  changeStatus,
  createProduct,
  runGuarded,
  saleLineStatements,
  type Actor,
} from "../src/services/inventory";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
const admin: Actor = { id: "U_ADMIN", role: "ADMIN", source: "ADMIN" };
const staff: Actor = { id: "U_STAFF", role: "STAFF", source: "POS" };

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  for (const [id, role] of [["U_ADMIN", "ADMIN"], ["U_STAFF", "STAFF"]] as const) {
    await tdb.d1
      .prepare("INSERT INTO user (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)")
      .bind(id, `${id}@example.com`, id, role)
      .run();
  }
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

async function newProduct(overrides: Partial<Parameters<typeof createProduct>[2]> = {}) {
  const created = await createProduct(db, admin, { title: "Luna Moth", status: "AVAILABLE", priceCents: 12000, ...overrides });
  if (!created.ok) throw new Error(created.message);
  return created;
}
const getProduct = (id: string) => db.select().from(products).where(eq(products.id, id)).get();
const ledger = (id: string) => db.select().from(inventoryTransactions).where(eq(inventoryTransactions.productId, id)).all();

function saleRow(id: string, number: number, key: string) {
  return db.insert(sales).values({
    id,
    number,
    channel: "MARKET",
    soldByUserId: "U_STAFF",
    subtotalCents: 100,
    totalCents: 100,
    idempotencyKey: key,
    occurredAt: new Date(),
  });
}
let saleCounter = 1000;
async function sell(productId: string, quantity: number, status: "AVAILABLE" | "AT_EVENT" = "AVAILABLE") {
  const saleId = newId();
  const n = ++saleCounter;
  return runGuarded(db, [saleRow(saleId, n, `k-${n}`), ...saleLineStatements(db, { productId, fromStatus: status, quantity, saleId }, staff)]);
}

describe("createProduct", () => {
  it("allocates sequential SKUs, unique slugs and writes a creation transaction", async () => {
    const a = await newProduct({ title: "Blue Morpho" });
    const b = await newProduct({ title: "Blue Morpho" });
    expect(a.sku).toMatch(/^FFA-\d{6}$/);
    expect(Number(b.sku.slice(4))).toBe(Number(a.sku.slice(4)) + 1);
    expect(a.slug).toBe("blue-morpho");
    expect(b.slug).toBe("blue-morpho-2");
    const tx = await ledger(a.id);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ fromStatus: null, toStatus: "AVAILABLE", quantityDelta: 1, quantityAfter: 1, source: "ADMIN" });
  });
  it("starts as a DRAFT", async () => {
    const created = await createProduct(db, admin, { title: "Draft piece" });
    if (!created.ok) throw new Error("unexpected");
    expect((await getProduct(created.id))?.status).toBe("DRAFT");
  });
  it("rejects impossible stock", async () => {
    expect(await createProduct(db, admin, { title: "x", status: "AVAILABLE", quantity: 0 })).toMatchObject({ ok: false, code: "INVALID_QUANTITY" });
    expect(await createProduct(db, admin, { title: "x", status: "SOLD", quantity: 2 })).toMatchObject({ ok: false, code: "INVALID_QUANTITY" });
    expect(await createProduct(db, admin, { title: "x", quantity: -1 })).toMatchObject({ ok: false, code: "INVALID_QUANTITY" });
  });
  it("writes an audit row", async () => {
    const p = await newProduct({ title: "Audited" });
    const rows = await db.all<{ action: string; diff: string }>(sql`SELECT action, diff FROM audit_log WHERE entity_id = ${p.id}`);
    expect(rows[0]?.action).toBe("product.create");
    expect(JSON.parse(rows[0]!.diff)).toMatchObject({ sku: p.sku });
  });
});

describe("changeStatus", () => {
  it("moves between statuses and records the ledger", async () => {
    const p = await newProduct();
    const res = await changeStatus(db, staff, { productId: p.id, to: "RESERVED", reason: "Held for a customer" });
    expect(res).toMatchObject({ ok: true, status: "RESERVED", quantity: 1 });
    const tx = await ledger(p.id);
    expect(tx).toHaveLength(2);
    expect(tx[1]).toMatchObject({ fromStatus: "AVAILABLE", toStatus: "RESERVED", quantityDelta: 0, quantityAfter: 1, notes: "Held for a customer", source: "POS", userId: "U_STAFF" });
  });
  it("rejects invalid, forbidden and unexplained moves", async () => {
    const p = await newProduct();
    expect(await changeStatus(db, admin, { productId: p.id, to: "AVAILABLE" })).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(await changeStatus(db, staff, { productId: p.id, to: "ARCHIVED" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await changeStatus(db, admin, { productId: "missing", to: "SOLD" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await changeStatus(db, admin, { productId: p.id, to: "SOLD" });
    expect(await changeStatus(db, admin, { productId: p.id, to: "AVAILABLE" })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(await changeStatus(db, staff, { productId: p.id, to: "AVAILABLE", reason: "Returned" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
  it("marking SOLD empties the stock and reopening restores it", async () => {
    const p = await newProduct({ quantity: 3 });
    expect(await changeStatus(db, admin, { productId: p.id, to: "SOLD" })).toMatchObject({ ok: true, quantity: 0 });
    expect((await ledger(p.id)).at(-1)).toMatchObject({ quantityDelta: -3, quantityAfter: 0, toStatus: "SOLD" });
    expect(await changeStatus(db, admin, { productId: p.id, to: "AVAILABLE", reason: "Sale fell through", restoreQuantity: 2 })).toMatchObject({ ok: true, quantity: 2 });
    expect(await getProduct(p.id)).toMatchObject({ status: "AVAILABLE", quantity: 2 });
  });
  it("archives and restores, tracking archivedAt", async () => {
    const p = await newProduct();
    await changeStatus(db, admin, { productId: p.id, to: "ARCHIVED" });
    expect((await getProduct(p.id))?.archivedAt).toBeInstanceOf(Date);
    await changeStatus(db, admin, { productId: p.id, to: "DRAFT" });
    expect((await getProduct(p.id))?.archivedAt).toBeNull();
  });
  it("lets only one of two simultaneous changes win", async () => {
    const p = await newProduct();
    const results = await Promise.all([
      changeStatus(db, admin, { productId: p.id, to: "RESERVED" }),
      changeStatus(db, admin, { productId: p.id, to: "AT_EVENT" }),
    ]);
    const ok = results.filter((r) => r.ok);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const tx = await ledger(p.id);
    expect(tx).toHaveLength(1 + ok.length);
    for (const r of results) if (!r.ok) expect(r.code).toBe("CONFLICT");
  });
});

describe("adjustStock", () => {
  it("needs a reason and a different whole quantity", async () => {
    const p = await newProduct({ quantity: 2 });
    expect(await adjustStock(db, staff, { productId: p.id, newQuantity: 5, reason: " " })).toMatchObject({ code: "REASON_REQUIRED" });
    expect(await adjustStock(db, staff, { productId: p.id, newQuantity: 2, reason: "x" })).toMatchObject({ code: "INVALID_QUANTITY" });
    expect(await adjustStock(db, staff, { productId: p.id, newQuantity: -1, reason: "x" })).toMatchObject({ code: "INVALID_QUANTITY" });
    expect(await adjustStock(db, staff, { productId: p.id, newQuantity: 1.5, reason: "x" })).toMatchObject({ code: "INVALID_QUANTITY" });
  });
  it("sells out at zero and restocks to AVAILABLE", async () => {
    const p = await newProduct({ quantity: 2 });
    expect(await adjustStock(db, staff, { productId: p.id, newQuantity: 0, reason: "Counted, none left" })).toMatchObject({ ok: true, status: "SOLD" });
    expect(await adjustStock(db, staff, { productId: p.id, newQuantity: 4, reason: "New batch" })).toMatchObject({ ok: true, status: "AVAILABLE" });
    const tx = await ledger(p.id);
    expect(tx.map((t) => [t.quantityDelta, t.quantityAfter])).toEqual([[2, 2], [-2, 0], [4, 4]]);
  });
  it("leaves a DRAFT a DRAFT", async () => {
    const p = await createProduct(db, admin, { title: "Draft stock" });
    if (!p.ok) throw new Error("unexpected");
    expect(await adjustStock(db, admin, { productId: p.id, newQuantity: 0, reason: "None yet" })).toMatchObject({ ok: true, status: "DRAFT" });
  });
});

describe("selling", () => {
  it("never sells the last unit twice", async () => {
    const p = await newProduct({ title: "One of a kind" });
    const results = await Promise.all([sell(p.id, 1), sell(p.id, 1), sell(p.id, 1)]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    for (const r of results) if (r) expect(r.code).toBe("CONFLICT");
    expect(await getProduct(p.id)).toMatchObject({ status: "SOLD", quantity: 0 });
    const tx = await ledger(p.id);
    expect(tx).toHaveLength(2);
    expect(tx[1]).toMatchObject({ toStatus: "SOLD", quantityDelta: -1, quantityAfter: 0 });
    // Failed attempts rolled back their sale rows too.
    const saleCount = await db.all<{ c: number }>(sql`SELECT COUNT(*) AS c FROM sale WHERE id IN (SELECT sale_id FROM inventory_transaction WHERE product_id = ${p.id})`);
    expect(saleCount[0]?.c).toBe(1);
  });
  it("lets several buyers share a multi-quantity item and never goes below zero", async () => {
    const p = await newProduct({ quantity: 5 });
    expect(await Promise.all([sell(p.id, 2), sell(p.id, 2)])).toEqual([null, null]);
    expect(await getProduct(p.id)).toMatchObject({ status: "AVAILABLE", quantity: 1 });
    const over = await sell(p.id, 2);
    expect(over).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await getProduct(p.id)).toMatchObject({ quantity: 1 });
    expect(await sell(p.id, 1)).toBeNull();
    expect(await getProduct(p.id)).toMatchObject({ status: "SOLD", quantity: 0 });
  });
  it("only sells items that are sellable", async () => {
    const draft = await createProduct(db, admin, { title: "Not ready" });
    if (!draft.ok) throw new Error("unexpected");
    expect(await sell(draft.id, 1)).toMatchObject({ code: "CONFLICT" });
    const pending = await newProduct();
    await changeStatus(db, admin, { productId: pending.id, to: "PENDING_PAYMENT" });
    expect(await sell(pending.id, 1)).toMatchObject({ code: "CONFLICT" });
    const atEvent = await newProduct();
    await changeStatus(db, admin, { productId: atEvent.id, to: "AT_EVENT" });
    expect(await sell(atEvent.id, 1, "AT_EVENT")).toBeNull();
  });
  it("rolls back a whole multi-item sale when one line cannot be filled", async () => {
    const a = await newProduct({ quantity: 3 });
    const b = await newProduct({ quantity: 1 });
    const saleId = newId();
    const n = ++saleCounter;
    const result = await runGuarded(db, [
      saleRow(saleId, n, `k-${n}`),
      ...saleLineStatements(db, { productId: a.id, fromStatus: "AVAILABLE", quantity: 2, saleId }, staff),
      ...saleLineStatements(db, { productId: b.id, fromStatus: "AVAILABLE", quantity: 2, saleId }, staff),
    ]);
    expect(result).toMatchObject({ code: "CONFLICT" });
    expect(await getProduct(a.id)).toMatchObject({ quantity: 3 });
    expect(await getProduct(b.id)).toMatchObject({ quantity: 1 });
    expect(await db.select().from(sales).where(eq(sales.id, saleId)).all()).toHaveLength(0);
  });
});
