import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@ffa/auth";
import { productImages, users } from "@ffa/db";
import { newId } from "@ffa/validators";
import type { Env } from "../src/env";
import { appRouter } from "../src/router";
import { excerptOf, displayValues } from "../src/services/portfolio";
import { createContext } from "../src/trpc";
import { makeDb, type Db } from "../src/store";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
let env: Env;
let admin: ReturnType<typeof as>;
let visitor: ReturnType<typeof as>;

function as(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers })));
}

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: {} as R2Bucket, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "http://localhost:3000" };
  await db.insert(users).values({ id: "U_A", email: "a@example.com", name: "A", role: "ADMIN", passwordHash: await hashPassword("correct horse battery staple") });
  admin = as((await as().auth.login({ email: "a@example.com", password: "correct horse battery staple" })).token);
  visitor = as();
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

let n = 0;
async function piece(title: string, opts: { price?: number; description?: string; status?: "AVAILABLE" | "DRAFT" | "RESERVED"; photo?: boolean; featured?: boolean; hidePrice?: boolean; visible?: boolean; categories?: string[]; values?: Record<string, unknown> } = {}) {
  const created = await admin.products.create({ title, priceCents: opts.price ?? 5000, costCents: 1234 });
  await admin.products.update({
    productId: created.id,
    description: opts.description ?? "",
    featured: opts.featured ?? false,
    hidePrice: opts.hidePrice ?? false,
    portfolioVisible: opts.visible ?? true,
  });
  if (opts.status !== "DRAFT") await admin.products.changeStatus({ productId: created.id, to: "AVAILABLE" });
  if (opts.status === "RESERVED") await admin.products.changeStatus({ productId: created.id, to: "RESERVED" });
  if (opts.photo !== false) await db.insert(productImages).values({ id: newId(), productId: created.id, r2Key: `products/${created.id}/${++n}.jpg`, altText: `${title} photo`, isPrimary: true });
  if (opts.categories?.length) {
    const all = await admin.categories.list();
    await admin.products.setCategories({ productId: created.id, categoryIds: opts.categories.map((slug) => all.find((c) => c.slug === slug)!.id) });
  }
  if (opts.values) await admin.products.setMetadata({ productId: created.id, values: opts.values as Record<string, string> });
  // Created within the same millisecond would make "newest" ambiguous.
  await new Promise((r) => setTimeout(r, 3));
  return created;
}

const titles = (r: { items: { title: string }[] } | null) => (r ? r.items.map((i) => i.title) : null);

describe("who can see the portfolio", () => {
  it("shows nothing to visitors until the site is live, but lets signed-in staff preview", async () => {
    await piece("Preview Moth");
    expect(await visitor.catalog.search({})).toBeNull();
    expect(await visitor.catalog.categories()).toEqual([]);
    expect(await visitor.site.sitemap()).toEqual({ live: false, pieces: [], events: [] });
    expect(titles(await admin.catalog.search({}))).toContain("Preview Moth");
    // Preview does not count as published for search engines.
    expect((await admin.site.sitemap()).live).toBe(false);
  });
});

describe("what the public portfolio may contain", () => {
  beforeAll(async () => {
    await admin.settings.update({ siteLive: true });
  });

  it("never includes drafts, hidden pieces or photo-less pieces, anywhere", async () => {
    await piece("Secret Draft", { status: "DRAFT" });
    await piece("Hidden Piece", { visible: false });
    await piece("No Photo Piece", { photo: false });
    const everything = JSON.stringify([await visitor.catalog.search({ pageSize: 48 }), await visitor.catalog.categories(), await visitor.site.sitemap()]);
    for (const hidden of ["Secret Draft", "Hidden Piece", "No Photo Piece", "secret-draft", "hidden-piece", "no-photo-piece"]) expect(everything).not.toContain(hidden);
    expect(everything).toContain("Preview Moth");
  });

  it("never exposes cost, stock, or internal fields", async () => {
    const result = JSON.stringify(await visitor.catalog.search({ pageSize: 48 }));
    for (const field of ["costCents", "quantity", "reservedNote", "reservedCustomerId", "importBatchId", "externalId", "weightGrams", "id\":", "portfolioVisible", "status\":\"DRAFT"]) {
      expect(result).not.toContain(field);
    }
    expect(result).not.toContain("1234");
  });

  it("shows a photo-less piece only when the owner allows it", async () => {
    await admin.settings.update({ showProductsWithoutPhotos: true });
    expect(titles(await visitor.catalog.search({ pageSize: 48 }))).toContain("No Photo Piece");
    await admin.settings.update({ showProductsWithoutPhotos: false });
    expect(titles(await visitor.catalog.search({ pageSize: 48 }))).not.toContain("No Photo Piece");
  });

  it("reports in-progress sales and event pieces as simply available", async () => {
    const atEvent = await piece("At The Market");
    const paying = await piece("Paying Now");
    await admin.products.changeStatus({ productId: atEvent.id, to: "AT_EVENT" });
    await admin.products.changeStatus({ productId: paying.id, to: "PENDING_PAYMENT" });
    const items = (await visitor.catalog.search({ pageSize: 48 }))!.items;
    expect(items.find((i) => i.title === "At The Market")!.status).toBe("AVAILABLE");
    expect(items.find((i) => i.title === "Paying Now")!.status).toBe("AVAILABLE");
    expect(JSON.stringify(items)).not.toMatch(/AT_EVENT|PENDING_PAYMENT/);
  });

  it("only lists the sitemap once the site is live", async () => {
    const map = await visitor.site.sitemap();
    expect(map.live).toBe(true);
    expect(map.pieces.length).toBeGreaterThan(0);
    expect(map.pieces.every((p) => typeof p.slug === "string" && typeof p.updatedAt === "number")).toBe(true);
  });
});

describe("searching, sorting and filtering", () => {
  beforeAll(async () => {
    await piece("Luna Moth in Walnut", { price: 12000, description: "A pale green luna moth. Mounted by hand in walnut.", categories: ["moth"], featured: true, values: { insect_type: "Moth", frame_color: "Walnut", provenance: "Ethically sourced", tags: [] } });
    await piece("Atlas Moth Print", { price: 4500, description: "Giant silk moth.", categories: ["moth"], values: { insect_type: "Moth", frame_color: "Black" } });
    await piece("Stag Beetle Shadowbox", { price: 8000, description: "Engraved style stag beetle.", categories: ["beetle"], values: { insect_type: "Beetle", frame_color: "Walnut" } });
    await piece("Mystery Piece", { price: 9900, hidePrice: true, description: "No price shown.", categories: ["beetle"] });
    await piece("Reserved Dragonfly", { price: 6000, status: "RESERVED", description: "Held for someone.", categories: ["butterfly"] });
  });

  it("finds words in the title, description, category and field values", async () => {
    expect(titles(await visitor.catalog.search({ q: "walnut" }))!.sort()).toEqual(["Luna Moth in Walnut", "Stag Beetle Shadowbox"]);
    expect(titles(await visitor.catalog.search({ q: "silk" }))).toEqual(["Atlas Moth Print"]);
    expect(titles(await visitor.catalog.search({ q: "LUNA green" }))).toEqual(["Luna Moth in Walnut"]);
    expect(titles(await visitor.catalog.search({ q: "zzzz-nothing" }))).toEqual([]);
  });

  it("treats search text literally, never as a pattern", async () => {
    expect(titles(await visitor.catalog.search({ q: "%" }))).toEqual([]);
    expect(titles(await visitor.catalog.search({ q: "' OR 1=1 --" }))).toEqual([]);
  });

  it("sorts by price with hidden prices last, in both directions", async () => {
    const asc = titles(await visitor.catalog.search({ sort: "price-asc", pageSize: 48 }));
    expect(asc!.slice(-1)).toEqual(["Mystery Piece"]);
    const lowToHigh = (await visitor.catalog.search({ sort: "price-asc", pageSize: 48 }))!.items.map((i) => i.priceCents).filter((p) => p !== null);
    expect(lowToHigh).toEqual([...lowToHigh].sort((a, b) => a! - b!));
    const desc = (await visitor.catalog.search({ sort: "price-desc", pageSize: 48 }))!.items;
    expect(desc.at(-1)!.priceCents).toBeNull();
    expect(desc.find((i) => i.title === "Mystery Piece")!.priceCents).toBeNull();
  });

  it("falls back to newest when prices are switched off", async () => {
    await admin.settings.update({ showPrices: false });
    const r = (await visitor.catalog.search({ sort: "price-asc" }))!;
    expect(r.sort).toBe("newest");
    expect(r.items.every((i) => i.priceCents === null)).toBe(true);
    await admin.settings.update({ showPrices: true });
  });

  it("puts featured first, and sorts by title", async () => {
    expect((await visitor.catalog.search({ sort: "featured" }))!.items[0]!.title).toBe("Luna Moth in Walnut");
    const byTitle = titles(await visitor.catalog.search({ sort: "title", pageSize: 48 }))!;
    expect(byTitle).toEqual([...byTitle].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  });

  it("filters by category, availability and a public filterable field, with counts that include each choice", async () => {
    expect(titles(await visitor.catalog.search({ category: "beetle" }))!.sort()).toEqual(["Mystery Piece", "Stag Beetle Shadowbox"]);
    const onlyAvailable = await visitor.catalog.search({ show: "available", pageSize: 48 });
    expect(onlyAvailable!.items.some((i) => i.title === "Reserved Dragonfly")).toBe(false);
    expect((await visitor.catalog.search({ pageSize: 48 }))!.items.find((i) => i.title === "Reserved Dragonfly")!.status).toBe("RESERVED");

    const walnut = (await visitor.catalog.search({ filters: { frame_color: "Walnut" } }))!;
    expect(walnut.items.map((i) => i.title).sort()).toEqual(["Luna Moth in Walnut", "Stag Beetle Shadowbox"]);
    const colour = walnut.facets.fields.find((f) => f.key === "frame_color")!;
    expect(colour.options).toEqual(expect.arrayContaining([{ value: "Walnut", count: 2 }, { value: "Black", count: 1 }]));

    const moth = (await visitor.catalog.search({ category: "moth" }))!;
    expect(moth.facets.categories.find((c) => c.slug === "beetle")!.count).toBe(2);
    expect(moth.facets.categories.find((c) => c.slug === "moth")!.count).toBe(2);
  });

  it("only offers filters the owner made public and filterable", async () => {
    const keys = (await visitor.catalog.search({}))!.facets.fields.map((f) => f.key);
    expect(keys).toContain("insect_type");
    expect(keys).not.toContain("frame_size"); // public but not filterable
    const frame = (await admin.metadata.listFields()).find((f) => f.key === "frame_color")!;
    await admin.metadata.updateField({ id: frame.id, isPublic: false });
    const after = await visitor.catalog.search({ filters: { frame_color: "Walnut" } });
    expect(after!.facets.fields.map((f) => f.key)).not.toContain("frame_color");
    expect(JSON.stringify(after)).not.toMatch(/Walnut"?,"count/);
    await admin.metadata.updateField({ id: frame.id, isPublic: true });
  });

  it("hides a hidden category from the public", async () => {
    const butter = (await admin.categories.list()).find((c) => c.slug === "butterfly")!;
    await admin.categories.update({ id: butter.id, hidden: true });
    expect((await visitor.catalog.categories()).map((c) => c.slug)).not.toContain("butterfly");
    expect((await visitor.catalog.search({}))!.facets.categories.map((c) => c.slug)).not.toContain("butterfly");
    await admin.categories.update({ id: butter.id, hidden: false });
  });

  it("pages sensibly and clamps a page that is too high", async () => {
    const first = (await visitor.catalog.search({ pageSize: 2 }))!;
    expect(first.items).toHaveLength(2);
    expect(first.pages).toBe(Math.ceil(first.total / 2));
    const last = (await visitor.catalog.search({ pageSize: 2, page: 999 }))!;
    expect(last.page).toBe(first.pages);
    expect(last.items.length).toBeGreaterThan(0);
  });

  it("rejects too many filters and oversized input", async () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`f${i}`, "x"]));
    await expect(visitor.catalog.search({ filters: many })).rejects.toThrow();
    await expect(visitor.catalog.search({ q: "x".repeat(101) })).rejects.toThrow();
    await expect(visitor.catalog.search({ pageSize: 500 })).rejects.toThrow();
  });
});

describe("a single piece", () => {
  it("includes related pieces from the same category, never itself or anything private", async () => {
    const luna = (await visitor.catalog.search({ q: "Luna" }))!.items[0]!;
    const got = await visitor.catalog.get({ skuOrSlug: luna.sku });
    expect(got.related.map((r) => r.title)).toContain("Atlas Moth Print");
    expect(got.related[0]!.title).toBe("Atlas Moth Print");
    expect(got.related.some((r) => r.sku === luna.sku)).toBe(false);
    const text = JSON.stringify(got);
    expect(text).not.toContain("Secret Draft");
    expect(text).not.toContain("costCents");
  });
});

describe("helpers", () => {
  it("makes short, tidy excerpts", () => {
    expect(excerptOf("Short.")).toBe("Short.");
    const long = `${"word ".repeat(22)}end here. ${"more ".repeat(40)}`;
    expect(excerptOf(long).endsWith("end here.")).toBe(true);
    expect(excerptOf(`Tiny first. ${"word ".repeat(60)}`).endsWith("…")).toBe(true);
    expect(excerptOf("a".repeat(30) + " " + "b".repeat(200), 100).endsWith("…")).toBe(true);
    expect(excerptOf("  lots   of\n\nspace  ")).toBe("lots of space");
  });

  it("turns stored field values into plain words", () => {
    expect(displayValues("YES_NO", "true")).toEqual(["Yes"]);
    expect(displayValues("MULTI_SELECT", '["Rare","Gold"]')).toEqual(["Rare", "Gold"]);
    expect(displayValues("YEAR", "2026")).toEqual(["2026"]);
    expect(displayValues("TEXT", "  ")).toEqual([]);
  });
});
