import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { auditLog, desc, eq, labelPrints, labelTemplates, sql, users } from "@ffa/db";
import { LABEL_PRESETS, PRODUCTION_QR_BASE_URL, isTestLabelContext } from "@ffa/validators";
import type { Env } from "../src/env";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
import { loadLabelContext, prepareLabels, recordPrints, toTemplateDto, labelCounts } from "../src/services/labels";
import { listProducts } from "../src/services/product-list";
import { makeDb, type Db } from "../src/store";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
let env: Env;
let admin: ReturnType<typeof as>;
let staff: ReturnType<typeof as>;

function as(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
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

const realCtx = { baseUrl: PRODUCTION_QR_BASE_URL, isTest: false, environment: "production" as const };
const DAY = 24 * 3600_000;

async function piece(title: string, priceCents = 4500, status: "AVAILABLE" | "DRAFT" | "ARCHIVED" = "AVAILABLE") {
  const p = await admin.products.create({ title, priceCents, quantity: 1 });
  if (status === "AVAILABLE") await admin.products.changeStatus({ productId: p.id, to: "AVAILABLE" });
  if (status === "ARCHIVED") await admin.products.changeStatus({ productId: p.id, to: "ARCHIVED" });
  return p;
}
const item = (p: { id: string }, title: string, priceCents: number, copies = 1) => ({ productId: p.id, copies, title, priceCents });

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "https://web.test" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "A", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "S", role: "STAFF", passwordHash: hash },
  ]);
  const login = async (email: string) => (await as().auth.login({ email, password: "correct horse battery staple" })).token;
  admin = as(await login("a@example.com"));
  staff = as(await login("s@example.com"));
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

describe("test labels (LBL-13)", () => {
  it("is a test unless it is production and the QR address is the real domain", () => {
    expect(isTestLabelContext("production", "https://forestfae.ca")).toBe(false);
    expect(isTestLabelContext("production", "https://forestfae.ca/")).toBe(false);
    expect(isTestLabelContext("production", "HTTPS://ForestFae.ca")).toBe(false);
    expect(isTestLabelContext("production", "https://staging.forestfae.ca")).toBe(true);
    expect(isTestLabelContext("staging", "https://forestfae.ca")).toBe(true);
    expect(isTestLabelContext("local", "https://forestfae.ca")).toBe(true);
  });
  it("is read from the environment and the QR base URL setting", async () => {
    expect(await staff.labels.context()).toMatchObject({ isTest: true, environment: "local", baseUrl: PRODUCTION_QR_BASE_URL });
    expect(await loadLabelContext(db, { ENVIRONMENT: "production" })).toMatchObject({ isTest: false });
    await admin.settings.update({ qrBaseUrl: "https://staging.forestfae.ca" });
    expect(await loadLabelContext(db, { ENVIRONMENT: "production" })).toMatchObject({ isTest: true, baseUrl: "https://staging.forestfae.ca" });
    await admin.settings.update({ qrBaseUrl: PRODUCTION_QR_BASE_URL });
  });
});

describe("label templates (LBL-2)", () => {
  it("ships the presets the first time templates are listed, with 40 x 30 as the default", async () => {
    const list = await staff.labels.templates.list();
    expect(list.map((t) => t.name)).toEqual(LABEL_PRESETS.map((p) => p.body.name));
    expect(list.filter((t) => t.isDefault)).toHaveLength(1);
    expect(list.find((t) => t.isDefault)).toMatchObject({ widthMm: 40, heightMm: 30, orientation: "LANDSCAPE" });
    expect(list.find((t) => t.name.includes("40 x 70"))?.orientation).toBe("PORTRAIT");
    expect(list.find((t) => t.name.includes("Jewelry"))?.show).toEqual({ qr: true, sku: false, title: false, price: false });
  });
  it("lists presets only once, however often it is asked", async () => {
    await staff.labels.templates.list();
    await staff.labels.templates.list();
    const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(labelTemplates).get();
    expect(rows?.n).toBe(LABEL_PRESETS.length);
  });
  it("lets only an administrator change templates", async () => {
    const body = { ...LABEL_PRESETS[0]!.body, name: "Mine" };
    expect((await rejection(staff.labels.templates.create(body))).code).toBe("FORBIDDEN");
    const made = await admin.labels.templates.create(body);
    const found = (await staff.labels.templates.list()).find((t) => t.id === made.id);
    expect(found).toMatchObject({ name: "Mine", isDefault: false, active: true });
  });
  it("creates, edits, duplicates and archives, and records each in the audit log", async () => {
    const made = await admin.labels.templates.create({ ...LABEL_PRESETS[0]!.body, name: "Shelf tag", widthMm: 50, heightMm: 20, align: "center", textScale: 1.2 });
    await admin.labels.templates.update({ id: made.id, body: { ...LABEL_PRESETS[0]!.body, name: "Shelf tag 2", widthMm: 20, heightMm: 50, textScale: 0.8 } });
    const updated = (await admin.labels.templates.list()).find((t) => t.id === made.id)!;
    expect(updated).toMatchObject({ name: "Shelf tag 2", orientation: "PORTRAIT", textScale: 0.8, align: "left" });
    const copy = await admin.labels.templates.duplicate({ id: made.id });
    expect((await admin.labels.templates.list()).find((t) => t.id === copy.id)?.name).toBe("Shelf tag 2 copy");
    await admin.labels.templates.setActive({ id: made.id, active: false });
    expect((await staff.labels.templates.list()).some((t) => t.id === made.id)).toBe(false);
    expect((await admin.labels.templates.list({ includeInactive: true })).some((t) => t.id === made.id)).toBe(true);
    // Staff cannot ask for archived templates.
    expect((await staff.labels.templates.list({ includeInactive: true })).some((t) => t.id === made.id)).toBe(false);
    const actions = (await db.select({ action: auditLog.action }).from(auditLog).all()).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["label.template.create", "label.template.update", "label.template.archive"]));
  });
  it("keeps exactly one default and refuses to archive it", async () => {
    const list = await admin.labels.templates.list();
    const other = list.find((t) => !t.isDefault && t.active)!;
    const current = list.find((t) => t.isDefault)!;
    expect((await rejection(admin.labels.templates.setActive({ id: current.id, active: false }))).code).toBe("CONFLICT");
    await admin.labels.templates.setDefault({ id: other.id });
    const after = await admin.labels.templates.list();
    expect(after.filter((t) => t.isDefault).map((t) => t.id)).toEqual([other.id]);
    await admin.labels.templates.setDefault({ id: current.id });
  });
  it("refuses sizes, margins and empty labels that cannot work", async () => {
    const good = LABEL_PRESETS[0]!.body;
    await expect(admin.labels.templates.create({ ...good, widthMm: 5 })).rejects.toThrow();
    await expect(admin.labels.templates.create({ ...good, widthMm: 500 })).rejects.toThrow();
    await expect(admin.labels.templates.create({ ...good, marginMm: 9, heightMm: 15 })).rejects.toThrow();
    await expect(admin.labels.templates.create({ ...good, show: { qr: false, sku: false, title: false, price: false } })).rejects.toThrow();
    await expect(admin.labels.templates.create({ ...good, textScale: 5 })).rejects.toThrow();
    expect((await rejection(admin.labels.templates.update({ id: "nope", body: good }))).code).toBe("NOT_FOUND");
  });
  it("reads a template with damaged JSON as a safe default instead of failing", async () => {
    const row = (await db.select().from(labelTemplates).all())[0]!;
    const dto = toTemplateDto({ ...row, fields: "{not json", marginsMm: "[]" });
    expect(dto).toMatchObject({ marginMm: 1.5, align: "left", textScale: 1 });
    expect(dto.show).toEqual({ qr: true, sku: true, title: true, price: true });
  });
});

describe("choosing which pieces to label", () => {
  it("returns chosen pieces with fresh titles and prices, never archived ones", async () => {
    const a = await piece("Prep A", 1000);
    const b = await piece("Prep B", 2000);
    const gone = await piece("Prep Gone", 3000, "ARCHIVED");
    const r = await staff.labels.prepare({ source: "ids", productIds: [a.id, b.id, gone.id] });
    expect(r.items.map((i) => i.title)).toEqual(["Prep A", "Prep B"]);
    expect(r.items[0]).toMatchObject({ sku: a.sku, priceCents: 1000, state: "NONE", lastCopies: 0 });
    expect(r).toMatchObject({ isTest: true, baseUrl: PRODUCTION_QR_BASE_URL });
    await admin.products.update({ productId: a.id, title: "Prep A renamed" });
    expect((await staff.labels.prepare({ source: "ids", productIds: [a.id] })).items[0]!.title).toBe("Prep A renamed");
  });
  it("asks for at least one piece, and reports pieces that don't exist", async () => {
    expect((await rejection(staff.labels.prepare({ source: "ids", productIds: ["nope"] }))).code).toBe("NOT_FOUND");
    await expect(staff.labels.prepare({ source: "ids", productIds: [] })).rejects.toThrow();
  });
  it("selects a category", async () => {
    const cat = await admin.categories.create({ name: "Label cat" });
    const x = await piece("Cat X");
    await piece("Not in cat");
    await admin.products.setCategories({ productId: x.id, categoryIds: [cat.id] });
    const r = await staff.labels.prepare({ source: "category", categoryId: cat.id });
    expect(r.items.map((i) => i.title)).toEqual(["Cat X"]);
  });
  it("selects the pieces taken to an event, and not ones released from it", async () => {
    const e = await admin.events.create({ title: "Label fair", startsAt: Date.now() + 30 * DAY, endsAt: Date.now() + 31 * DAY });
    const keep = await piece("Fair keep");
    const drop = await piece("Fair drop");
    await admin.events.assign({ eventId: e.id, productIds: [keep.id, drop.id] });
    await admin.events.unassign({ eventId: e.id, productIds: [drop.id] });
    const r = await staff.labels.prepare({ source: "event", eventId: e.id });
    expect(r.items.map((i) => i.title)).toEqual(["Fair keep"]);
  });
});

describe("recording prints and spotting out-of-date labels (LBL-4, LBL-12)", () => {
  it("remembers what was printed, as a test while in a test environment", async () => {
    const p = await piece("Recorded", 4500);
    const r = await staff.labels.record({ items: [item(p, "Recorded", 4500, 3)], templateId: null, format: "40x30", printer: "PNG" });
    expect(r).toEqual({ recorded: 1, labels: 3, isTest: true });
    const row = (await db.select().from(labelPrints).where(eq(labelPrints.productId, p.id)).get())!;
    expect(row).toMatchObject({ copies: 3, isTest: true, printer: "PNG", titleSnapshot: "Recorded", priceCentsSnapshot: 4500, userId: "U_S", qrUrl: `${PRODUCTION_QR_BASE_URL}/p/${p.sku}` });
    const history = await staff.labels.history({ productId: p.id });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ copies: 3, isTest: true, title: "Recorded", priceCents: 4500, templateName: null });
    expect((await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(1).get())?.action).toBe("label.print.test");
  });
  it("moves a piece from never printed, to current, to out of date when the price or title changes", async () => {
    const p = await piece("Life cycle", 5000);
    const state = async () => (await staff.products.list({ q: p.sku, limit: 5 })).items[0]!.labelState;
    expect(await state()).toBe("NONE");
    await staff.labels.record({ items: [item(p, "Life cycle", 5000)], templateId: null, format: "40x30", printer: "NIIMBOT_B1" });
    expect(await state()).toBe("CURRENT");
    await admin.products.update({ productId: p.id, priceCents: 5500 });
    expect(await state()).toBe("STALE");
    await staff.labels.record({ items: [item(p, "Life cycle", 5500)], templateId: null, format: "40x30", printer: "NIIMBOT_B1" });
    expect(await state()).toBe("CURRENT");
    await admin.products.update({ productId: p.id, title: "Life cycle two" });
    expect(await state()).toBe("STALE");
    // A change to something that is not on the label does not make it stale.
    await staff.labels.record({ items: [item(p, "Life cycle two", 5500)], templateId: null, format: "40x30", printer: "PDF" });
    await admin.products.update({ productId: p.id, featured: true, description: "More words" });
    expect(await state()).toBe("CURRENT");
  });
  it("records what was drawn, so a piece edited while printing is flagged", async () => {
    const p = await piece("Race", 1000);
    await admin.products.update({ productId: p.id, priceCents: 1200 });
    await staff.labels.record({ items: [item(p, "Race", 1000)], templateId: null, format: "40x30", printer: "PNG" });
    expect((await staff.products.list({ q: p.sku, limit: 5 })).items[0]!.labelState).toBe("STALE");
  });
  it("lists unlabelled and out-of-date pieces, and filters the product list by them", async () => {
    const fresh = await piece("Unlabelled one");
    const stale = await piece("Stale one", 700);
    await staff.labels.record({ items: [item(stale, "Stale one", 700)], templateId: null, format: "40x30", printer: "PNG" });
    await admin.products.update({ productId: stale.id, priceCents: 800 });
    const unlabelled = await staff.labels.prepare({ source: "unlabelled" });
    expect(unlabelled.items.map((i) => i.productId)).toContain(fresh.id);
    expect(unlabelled.items.map((i) => i.productId)).not.toContain(stale.id);
    const outOfDate = await staff.labels.prepare({ source: "stale" });
    expect(outOfDate.items.map((i) => i.productId)).toContain(stale.id);
    expect(outOfDate.items.every((i) => i.state === "STALE")).toBe(true);
    expect((await staff.products.list({ labelState: "STALE", limit: 100 })).items.every((i) => i.labelState === "STALE")).toBe(true);
    const counts = await staff.labels.counts();
    expect(counts.stale).toBeGreaterThanOrEqual(1);
    expect(counts.unlabelled).toBeGreaterThanOrEqual(1);
  });
  it("keeps sold and archived pieces out of the 'all unlabelled' batch", async () => {
    const sold = await piece("Sold unlabelled");
    await admin.products.changeStatus({ productId: sold.id, to: "SOLD" });
    const archived = await piece("Archived unlabelled", 100, "ARCHIVED");
    const ids = (await staff.labels.prepare({ source: "unlabelled" })).items.map((i) => i.productId);
    expect(ids).not.toContain(sold.id);
    expect(ids).not.toContain(archived.id);
  });
  it("lets a sold piece be reprinted when asked for by id", async () => {
    const sold = await piece("Sold by id");
    await admin.products.changeStatus({ productId: sold.id, to: "SOLD" });
    expect((await staff.labels.prepare({ source: "ids", productIds: [sold.id] })).items).toHaveLength(1);
  });
  it("refuses bad records: nothing, repeats, unknown pieces, unknown templates, and huge batches", async () => {
    const p = await piece("Bad record");
    await expect(staff.labels.record({ items: [], templateId: null, format: "x", printer: "PNG" })).rejects.toThrow();
    expect((await rejection(staff.labels.record({ items: [item(p, "x", 1), item(p, "x", 1)], templateId: null, format: "x", printer: "PNG" }))).code).toBe("BAD_REQUEST");
    expect((await rejection(staff.labels.record({ items: [{ productId: "ghost", copies: 1, title: "x", priceCents: 1 }], templateId: null, format: "x", printer: "PNG" }))).code).toBe("NOT_FOUND");
    expect((await rejection(staff.labels.record({ items: [item(p, "x", 1)], templateId: "ghost", format: "x", printer: "PNG" }))).code).toBe("NOT_FOUND");
    await expect(staff.labels.record({ items: [item(p, "x", 1, 100)], templateId: null, format: "x", printer: "PNG" })).rejects.toThrow();
    const many = await Promise.all(Array.from({ length: 6 }, (_, i) => piece(`Many ${i}`)));
    expect((await rejection(staff.labels.record({ items: many.map((m) => item(m, "x", 1, 99)), templateId: null, format: "x", printer: "PNG" }))).code).toBe("BAD_REQUEST");
  });
  it("needs a signed-in user", async () => {
    expect((await rejection(as().labels.counts())).code).toBe("UNAUTHORIZED");
    expect((await rejection(as().labels.context())).code).toBe("UNAUTHORIZED");
  });
});

describe("real labels and test labels never count for each other (LBL-13)", () => {
  it("makes a piece look unlabelled in production until a real label is printed", async () => {
    const p = await piece("Test then real", 900);
    await staff.labels.record({ items: [item(p, "Test then real", 900)], templateId: null, format: "40x30", printer: "PNG" });
    const stateIn = async (isTest: boolean) => (await listProducts(db, { q: p.sku, labelIsTest: isTest })).rows[0]!.labelState;
    expect(await stateIn(true)).toBe("CURRENT");
    expect(await stateIn(false)).toBe("NONE");
    expect((await prepareLabels(db, realCtx, { source: "unlabelled" }) as { items: { productId: string }[] }).items.map((i) => i.productId)).toContain(p.id);
    const rec = await recordPrints(db, realCtx, "U_S", { items: [{ productId: p.id, copies: 1, title: "Test then real", priceCents: 900 }], templateId: null, format: "40x30", printer: "PNG" });
    expect(rec).toMatchObject({ ok: true, isTest: false });
    expect(await stateIn(false)).toBe("CURRENT");
    expect((await db.select().from(labelPrints).where(eq(labelPrints.productId, p.id)).all()).map((r) => r.isTest).sort()).toEqual([false, true]);
    expect(await labelCounts(db, realCtx)).toMatchObject({ unlabelled: expect.any(Number), stale: expect.any(Number) });
  });
  it("flags a real label stale even when a newer test label is current", async () => {
    const p = await piece("Real stale", 1000);
    await recordPrints(db, realCtx, "U_S", { items: [{ productId: p.id, copies: 1, title: "Real stale", priceCents: 1000 }], templateId: null, format: "40x30", printer: "PNG" });
    await admin.products.update({ productId: p.id, priceCents: 1100 });
    await staff.labels.record({ items: [item(p, "Real stale", 1100)], templateId: null, format: "40x30", printer: "PNG" });
    expect((await listProducts(db, { q: p.sku, labelIsTest: false })).rows[0]!.labelState).toBe("STALE");
    expect((await listProducts(db, { q: p.sku, labelIsTest: true })).rows[0]!.labelState).toBe("CURRENT");
  });
});
