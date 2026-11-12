import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { and, eq, events, inventoryTransactions, inquiries, labelPrints, productImages, products, sql, users } from "@ffa/db";
import { emptySetupProgress, type SaleInput } from "@ffa/validators";
import type { Env } from "../src/env";
import worker from "../src/index";
import { SAMPLE_ART } from "../src/media/sample-art.generated";
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
const anon = () => as();

function as(token?: string, opts: { pos?: boolean } = {}) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (opts.pos) headers.set("x-ffa-client", "pos");
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers })));
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

let keyCounter = 0;
const key = () => `setup-key-${String(++keyCounter).padStart(6, "0")}-xxxx`;
const sale = (items: { productId: string }[]) => ({ idempotencyKey: key(), channel: "MARKET", items: items.map((i) => ({ productId: i.productId, quantity: 1 })), paymentMethod: "CASH", discountCents: 0, discountReason: "", notes: "" }) as SaleInput;

const count = async (table: string, where = "1=1") => (await db.get<{ n: number }>(sql.raw(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)))!.n;
const sampleByTitle = async (title: string) => (await db.select().from(products).where(and(eq(products.title, title), eq(products.isSample, true))).get())!;

/** Sample rows that were kept on purpose would block the next test's load, so treat them as ordinary ones. */
async function forgetKeptSamples() {
  await db.update(products).set({ isSample: false }).where(eq(products.isSample, true));
  await db.update(events).set({ isSample: false }).where(eq(events.isSample, true));
}

async function realPiece(title: string, status: "AVAILABLE" | "DRAFT" = "AVAILABLE") {
  const p = await admin.products.create({ title, priceCents: 5000, quantity: 1 });
  if (status === "AVAILABLE") await admin.products.changeStatus({ productId: p.id, to: "AVAILABLE" });
  return p;
}

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

describe("Sample Data Mode: loading (SAMP-1, SAMP-2)", () => {
  beforeEach(async () => {
    await admin.setup.removeSamples();
  });

  it("creates the four pieces, one in each status, and the three events", async () => {
    const r = await admin.setup.loadSamples();
    expect(r).toMatchObject({ ok: true, products: 4, events: 3 });
    const rows = await db.select().from(products).where(eq(products.isSample, true)).all();
    expect(rows.map((p) => [p.title, p.status, p.quantity]).sort()).toEqual([
      ["Atlas Moth Display", "RESERVED", 1],
      ["Blue Morpho Shadowbox", "AVAILABLE", 1],
      ["Luna Moth Necklace", "SOLD", 0],
      ["Rainbow Scarab Collection", "AT_EVENT", 1],
    ]);
    const evs = await db.select().from(events).where(eq(events.isSample, true)).all();
    expect(evs.map((e) => e.title).sort()).toEqual(["Holiday Market", "Spring Craft Fair", "Woodland Arts Festival"]);
    expect(evs.every((e) => e.status === "PUBLISHED" && e.startsAt.getTime() > Date.now())).toBe(true);
  });

  it("gives each piece a picture, categories, details and a ledger row, and puts the AT_EVENT piece at the first event", async () => {
    await admin.setup.loadSamples();
    const scarab = await sampleByTitle("Rainbow Scarab Collection");
    expect(await count("product_image", "is_primary = 1 AND product_id IN (SELECT id FROM product WHERE is_sample = 1)")).toBe(4);
    expect(await count("product_category", `product_id = '${scarab.id}'`)).toBe(2);
    expect(await count("product_metadata_value", `product_id = '${scarab.id}'`)).toBeGreaterThan(1);
    expect(await count("inventory_transaction", `product_id = '${scarab.id}'`)).toBe(1);
    const link = await db.get<{ title: string; released: number | null }>(sql`SELECT e.title AS title, ep.released_at AS released FROM event_product ep JOIN event e ON e.id = ep.event_id WHERE ep.product_id = ${scarab.id}`);
    expect(link).toEqual({ title: "Spring Craft Fair", released: null });
  });

  it("uses the next SKUs and web addresses, even when a real piece already has the same title", async () => {
    const real = await realPiece("Blue Morpho Shadowbox");
    await admin.setup.loadSamples();
    const sample = await db.select().from(products).where(eq(products.isSample, true)).all();
    const morpho = sample.find((p) => p.title === "Blue Morpho Shadowbox")!;
    expect(morpho.slug).toBe("blue-morpho-shadowbox-2");
    expect(new Set([...sample.map((p) => p.sku), real.sku]).size).toBe(5);
  });

  it("refuses to load twice", async () => {
    await admin.setup.loadSamples();
    expect((await rejection(admin.setup.loadSamples())).code).toBe("CONFLICT");
    expect(await count("product", "is_sample = 1")).toBe(4);
  });

  it("is for the administrator only", async () => {
    expect((await rejection(staff.setup.loadSamples())).code).toBe("FORBIDDEN");
    expect((await rejection(staff.setup.removeSamples())).code).toBe("FORBIDDEN");
    expect((await rejection(anon().setup.get())).code).toBe("UNAUTHORIZED");
  });

  it("records who loaded it in the audit log", async () => {
    await admin.setup.loadSamples();
    expect(await count("audit_log", "action = 'samples.load' AND user_id = 'U_A'")).toBeGreaterThan(0);
  });
});

describe("Sample Data Mode: the public site (SAMP-3)", () => {
  beforeEach(async () => {
    await admin.setup.removeSamples();
    await admin.settings.update({ siteLive: true, showSampleData: false });
    await admin.setup.loadSamples();
  });

  it("hides sample pieces and events from visitors by default", async () => {
    const found = await anon().catalog.search();
    expect(found?.items.map((i) => i.title)).not.toContain("Blue Morpho Shadowbox");
    const sample = await sampleByTitle("Blue Morpho Shadowbox");
    expect((await rejection(anon().catalog.get({ skuOrSlug: sample.sku }))).code).toBe("NOT_FOUND");
    expect((await anon().catalog.list({ limit: 24 })).items.map((i) => i.title)).not.toContain("Blue Morpho Shadowbox");
    expect(await anon().events.publicList({ when: "upcoming" })).toEqual([]);
    expect((await rejection(anon().events.publicGet({ slug: "spring-craft-fair" }))).code).toBe("NOT_FOUND");
  });

  it("shows them when the owner chooses, with their pictures", async () => {
    await admin.settings.update({ showSampleData: true });
    const found = await anon().catalog.search();
    expect(found?.items.map((i) => i.title)).toEqual(expect.arrayContaining(["Blue Morpho Shadowbox", "Atlas Moth Display", "Luna Moth Necklace"]));
    const sample = await sampleByTitle("Blue Morpho Shadowbox");
    const one = await anon().catalog.get({ skuOrSlug: sample.sku });
    expect(one.images[0]?.path).toMatch(/^\/media\/samples\/blue-morpho__[a-z0-9]{6}\.svg$/);
    expect((await anon().events.publicList({ when: "upcoming" })).map((e) => e.title)).toContain("Spring Craft Fair");
    expect((await anon().events.publicGet({ slug: "spring-craft-fair" })).title).toBe("Spring Craft Fair");
  });

  it("adds exactly the four sample pieces and changes nothing else about the public list", async () => {
    const before = (await anon().catalog.search())?.total;
    await admin.settings.update({ showSampleData: true });
    const after = (await anon().catalog.search())?.total;
    expect(after! - before!).toBe(4);
  });

  it("serves the sample drawings as images that can't run anything", async () => {
    const sample = await sampleByTitle("Blue Morpho Shadowbox");
    const image = await db.select().from(productImages).where(eq(productImages.productId, sample.id)).get();
    const res = await worker.fetch(new Request(`https://api.test/media/${image!.r2Key}?w=640`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe(SAMPLE_ART["blue-morpho"]!.svg);
    expect((await worker.fetch(new Request("https://api.test/media/samples/not-a-picture.svg"), env)).status).toBe(404);
  });
});

describe("Sample Data Mode: removal in one click (SAMP-3)", () => {
  beforeEach(async () => {
    await admin.setup.removeSamples();
  });

  it("removes every sample row and leaves real data exactly as it was", async () => {
    const real = await realPiece("Real Moth");
    const realEvent = await admin.events.create({ title: "Real Market", startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 2 * 86_400_000 });
    await admin.events.assign({ eventId: realEvent.id, productIds: [real.id] });
    const ledgerBefore = await count("inventory_transaction", `product_id = '${real.id}'`);
    await admin.setup.loadSamples();

    const r = await admin.setup.removeSamples();
    expect(r).toMatchObject({ removedProducts: 4, removedEvents: 3, removedTestSales: 0, keptProducts: [], keptEvents: [] });
    expect(await count("product", "is_sample = 1")).toBe(0);
    expect(await count("event", "is_sample = 1")).toBe(0);
    expect(await count("product_image", "r2_key LIKE 'samples/%'")).toBe(0);
    expect(await count("inventory_transaction", "notes = 'Sample data'")).toBe(0);
    expect(await count("product", `id = '${real.id}'`)).toBe(1);
    expect(await count("event", `id = '${realEvent.id}'`)).toBe(1);
    expect(await count("inventory_transaction", `product_id = '${real.id}'`)).toBe(ledgerBefore);
    expect((await admin.setup.get()).samples).toMatchObject({ loaded: false });
  });

  it("can be loaded again afterwards, and keeps counting SKUs forward", async () => {
    await admin.setup.loadSamples();
    const first = (await db.select({ sku: products.sku }).from(products).where(eq(products.isSample, true)).all()).map((p) => p.sku);
    await admin.setup.removeSamples();
    await admin.setup.loadSamples();
    const second = (await db.select({ sku: products.sku }).from(products).where(eq(products.isSample, true)).all()).map((p) => p.sku);
    expect(second.some((s) => first.includes(s))).toBe(false);
  });

  it("does nothing, harmlessly, when there is nothing to remove", async () => {
    expect(await admin.setup.removeSamples()).toMatchObject({ removedProducts: 0, removedEvents: 0, removedTestSales: 0 });
  });

  it("also removes test sales made with only sample pieces, with their payments and ledger rows", async () => {
    await admin.setup.loadSamples();
    const morpho = await sampleByTitle("Blue Morpho Shadowbox");
    const made = await pos.sales.record(sale([{ productId: morpho.id }]));
    expect(made.duplicate).toBe(false);
    const salesBefore = await count("sale");
    const r = await admin.setup.removeSamples();
    expect(r.removedTestSales).toBe(1);
    expect(await count("sale")).toBe(salesBefore - 1);
    expect(await count("payment", `sale_id = '${made.sale.id}'`)).toBe(0);
    expect(await count("sale_item", `sale_id = '${made.sale.id}'`)).toBe(0);
    expect(await count("inventory_transaction", `sale_id = '${made.sale.id}'`)).toBe(0);
    expect(await count("product", "is_sample = 1")).toBe(0);
  });

  it("removes a voided test sale too", async () => {
    await admin.setup.loadSamples();
    const morpho = await sampleByTitle("Blue Morpho Shadowbox");
    const made = await pos.sales.record(sale([{ productId: morpho.id }]));
    await pos.sales.void({ saleId: made.sale.id, reason: "Trying it out" });
    const r = await admin.setup.removeSamples();
    expect(r).toMatchObject({ removedProducts: 4, removedTestSales: 1 });
  });

  it("keeps a sample piece that was sold in the same sale as a real piece, and says why", async () => {
    await admin.setup.loadSamples();
    const morpho = await sampleByTitle("Blue Morpho Shadowbox");
    const real = await realPiece("Real Beetle");
    const made = await pos.sales.record(sale([{ productId: morpho.id }, { productId: real.id }]));
    const r = await admin.setup.removeSamples();
    expect(r.removedProducts).toBe(3);
    expect(r.removedTestSales).toBe(0);
    expect(r.keptProducts).toEqual([expect.objectContaining({ title: "Blue Morpho Shadowbox", reason: expect.stringContaining(`sale #${made.sale.number}`) })]);
    expect(await count("sale", `id = '${made.sale.id}'`)).toBe(1);
    expect(await count("sale_item", `sale_id = '${made.sale.id}'`)).toBe(2);
    expect(await count("inventory_transaction", `sale_id = '${made.sale.id}'`)).toBe(2);
    expect(await count("product", `id = '${real.id}'`)).toBe(1);
    expect((await admin.setup.get()).samples.products).toBe(1);
    // Tidy up for the tests after this one: pretend the kept piece is an ordinary one.
    await forgetKeptSamples();
  });

  it("keeps a sample event that a real piece was taken to", async () => {
    await admin.setup.loadSamples();
    const real = await realPiece("Real Cicada");
    const spring = (await db.select().from(events).where(eq(events.title, "Spring Craft Fair")).get())!;
    await admin.events.assign({ eventId: spring.id, productIds: [real.id] });
    const r = await admin.setup.removeSamples();
    expect(r.removedEvents).toBe(2);
    expect(r.keptEvents).toEqual([{ title: "Spring Craft Fair", reason: "a piece that stays was taken to it" }]);
    expect(await count("event", `id = '${spring.id}'`)).toBe(1);
    expect(await count("event_product", `event_id = '${spring.id}' AND product_id = '${real.id}'`)).toBe(1);
    await forgetKeptSamples();
  });

  it("removes a photo the owner uploaded to a sample piece from storage", async () => {
    await admin.setup.loadSamples();
    const luna = await sampleByTitle("Luna Moth Necklace");
    const uploadedKey = `products/${luna.id}/01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg`;
    await tdb.r2.put(uploadedKey, new Uint8Array([1, 2, 3]));
    await db.insert(productImages).values({ id: "IMG_UP", productId: luna.id, r2Key: uploadedKey, sortOrder: 1 });
    await admin.setup.removeSamples();
    expect(await tdb.r2.get(uploadedKey)).toBeNull();
  });

  it("also clears things that pointed at a sample piece (inquiries, label prints)", async () => {
    await admin.setup.loadSamples();
    const luna = await sampleByTitle("Luna Moth Necklace");
    await db.insert(inquiries).values({ id: "INQ1", name: "Pat", email: "pat@example.com", message: "Hello", productId: luna.id });
    await db.insert(labelPrints).values({ id: "LP1", productId: luna.id, userId: "U_A", format: "pdf", printer: "PDF", titleSnapshot: luna.title, priceCentsSnapshot: luna.priceCents, qrUrl: "https://example.test/p/x" });
    await admin.setup.removeSamples();
    expect(await count("inquiry", "id = 'INQ1' AND product_id IS NULL")).toBe(1);
    expect(await count("label_print", "id = 'LP1'")).toBe(0);
  });

  it("records the removal in the audit log", async () => {
    await admin.setup.loadSamples();
    await admin.setup.removeSamples();
    expect(await count("audit_log", "action = 'samples.remove'")).toBeGreaterThan(0);
  });

  it("leaves a real piece's ledger rows locked, even though sample ones can go", async () => {
    const real = await realPiece("Locked Piece");
    await expect(tdb.d1.prepare("DELETE FROM inventory_transaction WHERE product_id = ?").bind(real.id).run()).rejects.toThrow(/append-only/);
    await expect(tdb.d1.prepare("DELETE FROM product WHERE id = ?").bind(real.id).run()).rejects.toThrow(/archived/);
    expect(await db.select({ n: sql<number>`COUNT(*)` }).from(inventoryTransactions).where(eq(inventoryTransactions.productId, real.id)).get()).toEqual({ n: 2 });
  });
});

describe("the Setup Wizard (SET-1 to SET-8)", () => {
  beforeEach(async () => {
    await admin.setup.restart();
  });

  it("starts at the first step with nothing done", async () => {
    const s = await admin.setup.get();
    expect(s).toMatchObject({ next: "business", handled: 0, total: 7, pending: true });
    expect(s.progress).toEqual(emptySetupProgress());
  });

  it("remembers progress between visits, and moves to the next step", async () => {
    await admin.setup.markStep({ step: "business", how: "done" });
    await admin.setup.markStep({ step: "brand", how: "skipped" });
    const s = await admin.setup.get();
    expect(s).toMatchObject({ next: "store", handled: 2 });
    expect(s.progress.done).toEqual(["business"]);
    expect(s.progress.skipped).toEqual(["brand"]);
  });

  it("lets every step except the first be skipped", async () => {
    const refused = await rejection(admin.setup.markStep({ step: "business", how: "skipped" }));
    expect(refused.code).toBe("BAD_REQUEST");
    for (const step of ["brand", "store", "categories", "product", "qr", "event"] as const) await admin.setup.markStep({ step, how: "skipped" });
    expect((await admin.setup.get()).handled).toBe(6);
  });

  it("can be finished only once the business step is done, and then stops being offered", async () => {
    expect((await rejection(admin.setup.finish())).code).toBe("BAD_REQUEST");
    await admin.setup.markStep({ step: "business", how: "done" });
    const done = await admin.setup.finish();
    expect(done.finishedAt).toBeGreaterThan(0);
    expect(done.skipped).toHaveLength(6);
    expect(await admin.setup.get()).toMatchObject({ pending: false, next: null, handled: 7 });
  });

  it("can be dismissed from the dashboard and brought back from Settings", async () => {
    await admin.setup.dismiss();
    expect((await admin.setup.get()).pending).toBe(false);
    await admin.setup.restart();
    expect(await admin.setup.get()).toMatchObject({ pending: true, handled: 0 });
  });

  it("says what already exists, preferring a real piece to a sample one for the QR demonstration", async () => {
    await db.update(products).set({ archivedAt: new Date() }).where(eq(products.isSample, false));
    await admin.setup.loadSamples();
    const withSamples = await admin.setup.get();
    expect(withSamples.facts.demoPiece).toMatchObject({ isSample: true, status: "AVAILABLE" });
    expect(withSamples.facts.realPieces).toBe(0);
    expect(withSamples.facts.categories).toBeGreaterThan(0);
    await realPiece("Demo Real");
    expect((await admin.setup.get()).facts).toMatchObject({ realPieces: 1, demoPiece: { title: "Demo Real", isSample: false } });
    await admin.setup.removeSamples();
  });

  it("is for the administrator only, and its progress isn't public", async () => {
    for (const call of [() => staff.setup.get(), () => staff.setup.markStep({ step: "business", how: "done" }), () => staff.setup.finish(), () => staff.setup.dismiss(), () => staff.setup.restart()]) {
      expect((await rejection(call())).code).toBe("FORBIDDEN");
    }
    expect(Object.keys(await anon().settings.public())).not.toContain("setupProgress");
    expect(Object.keys(await anon().settings.public())).not.toContain("showSampleData");
  });

  it("rejects a step that doesn't exist", async () => {
    await expect(admin.setup.markStep({ step: "tax" as never, how: "done" })).rejects.toThrow();
  });
});
