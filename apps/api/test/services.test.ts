import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@ffa/db";
import type { ProductRow } from "@ffa/db";
import { defaultSettings } from "@ffa/validators";
import { makeDb, type Db } from "../src/store";
import { hitRateLimit } from "../src/services/rate-limit";
import { sanitizeDiff, writeAudit } from "../src/services/audit";
import { loadSettings, saveSettings, toPublicSettings } from "../src/services/settings";
import { projectProduct, toPublicProduct } from "../src/services/projections";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  await tdb.d1.prepare("INSERT INTO user (id, email, name, role, created_at, updated_at) VALUES ('U1', 'a@example.com', 'A', 'ADMIN', 1, 1)").run();
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

describe("rate limiting", () => {
  const rule = { limit: 3, windowMs: 60_000 };
  it("allows up to the limit then blocks with a retry time", async () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(await hitRateLimit(db, "ip:1", rule, t + i)).toEqual({ allowed: true });
    const blocked = await hitRateLimit(db, "ip:1", rule, t + 10_000);
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });
  it("keeps keys separate", async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit(db, "ip:2", rule, 5_000_000);
    expect((await hitRateLimit(db, "ip:2", rule, 5_000_001)).allowed).toBe(false);
    expect((await hitRateLimit(db, "ip:3", rule, 5_000_001)).allowed).toBe(true);
  });
  it("starts a new window after the old one expires", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit(db, "ip:4", rule, 9_000_000);
    expect((await hitRateLimit(db, "ip:4", rule, 9_000_000 + 30_000)).allowed).toBe(false);
    expect((await hitRateLimit(db, "ip:4", rule, 9_000_000 + 60_001)).allowed).toBe(true);
  });
  it("counts concurrent attempts exactly", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => hitRateLimit(db, "ip:5", rule, 20_000_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
});

describe("audit log", () => {
  it("drops secret-looking keys at any depth", () => {
    const text = sanitizeDiff({ email: "a@b.c", passwordHash: "x", nested: { token: "t", ok: 1 }, list: [{ secret: 1, n: 2 }] });
    expect(JSON.parse(text!)).toEqual({ email: "a@b.c", nested: { ok: 1 }, list: [{ n: 2 }] });
    expect(text).not.toMatch(/passwordHash|token|secret/);
  });
  it("returns null when there is nothing to record", () => {
    expect(sanitizeDiff(null)).toBeNull();
    expect(sanitizeDiff({ password: "x" })).toBeNull();
  });
  it("stores entries, including ones with no signed-in user", async () => {
    await writeAudit(db, { userId: null, action: "auth.login.failed", entityType: "user", ip: "203.0.113.9" });
    const rows = await db.all<{ user_id: string | null; ip: string }>(sql`SELECT user_id, ip FROM audit_log WHERE action = 'auth.login.failed'`);
    expect(rows).toEqual([{ user_id: null, ip: "203.0.113.9" }]);
  });
});

describe("settings", () => {
  it("returns defaults before anything is saved", async () => {
    expect(await loadSettings(db)).toEqual(defaultSettings());
  });
  it("saves valid changes, audits them and ignores no-ops", async () => {
    expect(await saveSettings(db, "U1", { storeMode: "EVENT_ONLY", showPrices: true })).toEqual({ ok: true, changed: ["storeMode"] });
    expect((await loadSettings(db)).storeMode).toBe("EVENT_ONLY");
    const audit = await db.all<{ diff: string }>(sql`SELECT diff FROM audit_log WHERE action = 'settings.update'`);
    expect(JSON.parse(audit[0]!.diff)).toEqual({ storeMode: { from: "SHOWCASE_ONLY", to: "EVENT_ONLY" } });
    expect(await saveSettings(db, "U1", { storeMode: "EVENT_ONLY" })).toEqual({ ok: true, changed: [] });
  });
  it("rejects unknown keys and bad values without saving anything", async () => {
    expect(await saveSettings(db, "U1", { storeMode: "ONLINE_STORE", nope: 1 })).toMatchObject({ ok: false });
    expect(await saveSettings(db, "U1", { qrBaseUrl: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect((await loadSettings(db)).storeMode).toBe("EVENT_ONLY");
  });
  it("exposes only public settings to the public site", async () => {
    const pub = toPublicSettings(await loadSettings(db));
    expect(pub.storeMode).toBe("EVENT_ONLY");
    for (const k of ["inquiryEmail", "systemFromEmail", "replyToEmail", "qrBaseUrl", "taxRegistered", "taxRegistrationNumber"]) {
      expect(k in pub).toBe(false);
    }
  });
});

const baseProduct = {
  id: "P1",
  sku: "FFA-000001",
  slug: "luna-moth",
  title: "Luna Moth",
  description: "A moth.",
  priceCents: 12000,
  costCents: 4000,
  currency: "CAD",
  status: "AVAILABLE",
  quantity: 3,
  featured: true,
  portfolioVisible: true,
  onlineVisible: false,
  onlinePurchasable: false,
  hidePrice: false,
  weightGrams: null,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  shippingClass: null,
  taxCategory: null,
  fragile: false,
  reservedCustomerId: "C1",
  reservedNote: "for Sam",
  reservedUntil: null,
  isSample: false,
  importBatchId: "B1",
  externalId: "row-7",
  listedOnEtsy: true,
  etsyUrl: "https://etsy.example/1",
  etsyListingId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  archivedAt: null,
} as ProductRow;
const showing = { showPrices: true, showProductsWithoutPhotos: false, showStockCounts: false, showEtsyLinks: true };

describe("product projections", () => {
  it("ADMIN sees cost, STAFF never does", () => {
    expect(projectProduct(baseProduct, "ADMIN")).toHaveProperty("costCents", 4000);
    const staff = projectProduct(baseProduct, "STAFF");
    expect("costCents" in staff).toBe(false);
    expect(staff).toHaveProperty("priceCents", 12000);
    expect(staff).toHaveProperty("quantity", 3);
  });
  it("the public product is a whitelist with no private fields", () => {
    const pub = toPublicProduct(baseProduct, showing, true)!;
    expect(Object.keys(pub).sort()).toEqual(
      ["currency", "description", "etsyUrl", "featured", "priceCents", "remaining", "sku", "slug", "status", "title"],
    );
    expect(JSON.stringify(pub)).not.toMatch(/4000|C1|for Sam|row-7|B1/);
  });
  it("hides drafts, archived items, hidden items and (by default) items without photos", () => {
    expect(toPublicProduct({ ...baseProduct, status: "DRAFT" }, showing, true)).toBeNull();
    expect(toPublicProduct({ ...baseProduct, status: "ARCHIVED" }, showing, true)).toBeNull();
    expect(toPublicProduct({ ...baseProduct, portfolioVisible: false }, showing, true)).toBeNull();
    expect(toPublicProduct(baseProduct, showing, false)).toBeNull();
    expect(toPublicProduct(baseProduct, { ...showing, showProductsWithoutPhotos: true }, false)).not.toBeNull();
  });
  it("keeps SOLD items visible and never reveals a pending payment", () => {
    expect(toPublicProduct({ ...baseProduct, status: "SOLD", quantity: 0 }, showing, true)?.status).toBe("SOLD");
    expect(toPublicProduct({ ...baseProduct, status: "PENDING_PAYMENT" }, showing, true)?.status).toBe("AVAILABLE");
    expect(toPublicProduct({ ...baseProduct, status: "AT_EVENT" }, showing, true)?.status).toBe("AVAILABLE");
  });
  it("honours the price, stock-count and Etsy settings", () => {
    expect(toPublicProduct(baseProduct, { ...showing, showPrices: false }, true)?.priceCents).toBeNull();
    expect(toPublicProduct({ ...baseProduct, hidePrice: true }, showing, true)?.priceCents).toBeNull();
    expect(toPublicProduct(baseProduct, showing, true)?.remaining).toBeNull();
    expect(toPublicProduct(baseProduct, { ...showing, showStockCounts: true }, true)?.remaining).toBe(3);
    expect(toPublicProduct(baseProduct, { ...showing, showEtsyLinks: false }, true)?.etsyUrl).toBeNull();
  });
});
