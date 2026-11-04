import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { productImages, sql, users } from "@ffa/db";
import { newId } from "@ffa/validators";
import type { Env } from "../src/env";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
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

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: {} as R2Bucket, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "http://localhost:3000" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "A", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "S", role: "STAFF", passwordHash: hash },
  ]);
  const tokenFor = async (email: string) => (await as().auth.login({ email, password: "correct horse battery staple" })).token;
  admin = as(await tokenFor("a@example.com"));
  staff = as(await tokenFor("s@example.com"));
  await admin.settings.update({ siteLive: true });
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

async function publishedProduct(title: string) {
  const created = await admin.products.create({ title, priceCents: 5000, costCents: 1000 });
  await admin.products.changeStatus({ productId: created.id, to: "AVAILABLE" });
  await db.insert(productImages).values({ id: newId(), productId: created.id, r2Key: `p/${created.id}.jpg`, isPrimary: true });
  return created;
}

describe("editing products", () => {
  it("changes details, audits the diff and never touches stock or status", async () => {
    const p = await publishedProduct("Blue Morpho");
    expect(await staff.products.update({ productId: p.id, title: "  Blue Morpho, framed  ", priceCents: 6500, featured: true })).toEqual({
      changed: ["title", "priceCents", "featured"],
    });
    const got = await staff.products.get({ idOrSku: p.sku });
    expect(got).toMatchObject({ title: "Blue Morpho, framed", priceCents: 6500, featured: true, status: "AVAILABLE", quantity: 1, slug: "blue-morpho" });
    expect(await staff.products.update({ productId: p.id, priceCents: 6500 })).toEqual({ changed: [] });
    const rows = await db.all<{ diff: string }>(sql`SELECT diff FROM audit_log WHERE action = 'product.update' AND entity_id = ${p.id}`);
    expect(JSON.parse(rows[0]!.diff)).toMatchObject({ priceCents: { from: 5000, to: 6500 } });
  });

  it("lets only an administrator change cost, and hides it from STAFF", async () => {
    const p = await publishedProduct("Cost test");
    expect((await rejection(staff.products.update({ productId: p.id, costCents: 1 }))).code).toBe("FORBIDDEN");
    await admin.products.update({ productId: p.id, costCents: 2500 });
    expect(await admin.products.get({ idOrSku: p.sku })).toHaveProperty("costCents", 2500);
    expect("costCents" in (await staff.products.get({ idOrSku: p.sku }))).toBe(false);
  });

  it("changes the slug, keeps the old address working, and refuses clashes", async () => {
    const a = await publishedProduct("Atlas Moth");
    const b = await publishedProduct("Emperor Moth");
    await admin.products.update({ productId: a.id, slug: "atlas-moth-framed" });
    expect((await as().catalog.get({ skuOrSlug: "atlas-moth" })).sku).toBe(a.sku);
    expect((await as().catalog.get({ skuOrSlug: "atlas-moth-framed" })).sku).toBe(a.sku);

    expect((await rejection(admin.products.update({ productId: b.id, slug: "atlas-moth-framed" }))).code).toBe("CONFLICT");
    expect((await rejection(admin.products.update({ productId: b.id, slug: "atlas-moth" }))).code).toBe("CONFLICT");
    expect((await rejection(admin.products.update({ productId: b.id, slug: "Not Valid" }))).code).toBe("BAD_REQUEST");
    expect((await rejection(admin.products.update({ productId: b.id, slug: "ffa-000001" }))).message).toMatch(/SKU/);

    // Going back to the old address is allowed for the same product.
    await admin.products.update({ productId: a.id, slug: "atlas-moth" });
    expect((await as().catalog.get({ skuOrSlug: "atlas-moth" })).sku).toBe(a.sku);
  });

  it("validates Etsy links and requires a title", async () => {
    const p = await publishedProduct("Etsy test");
    expect((await rejection(admin.products.update({ productId: p.id, etsyUrl: "http://etsy.example/x" }))).code).toBe("BAD_REQUEST");
    await admin.products.update({ productId: p.id, listedOnEtsy: true, etsyUrl: "https://forestfaefolkart.etsy.com/listing/1" });
    expect(await staff.products.get({ idOrSku: p.sku })).toMatchObject({ listedOnEtsy: true });
    expect((await rejection(admin.products.update({ productId: p.id, title: "   " }))).code).toBe("BAD_REQUEST");
  });

  it("reports a missing product", async () => {
    expect((await rejection(admin.products.update({ productId: "nope", title: "x" }))).code).toBe("NOT_FOUND");
  });
});

describe("categories", () => {
  it("starts with the eight defaults and lets STAFF read them", async () => {
    const list = await staff.categories.list();
    expect(list.map((c) => c.name)).toEqual(["Butterfly", "Moth", "Beetle", "Jewelry", "Taxidermy", "Featured", "Collection", "Limited Edition"]);
  });

  it("keeps management to administrators", async () => {
    expect((await rejection(staff.categories.create({ name: "Nope" }))).code).toBe("FORBIDDEN");
    expect((await rejection(staff.categories.reorder({ ids: [] }))).code).toBe("FORBIDDEN");
  });

  it("creates, renames, hides and reorders", async () => {
    const created = await admin.categories.create({ name: "Dragonfly", description: "Wings" });
    expect(created.slug).toBe("dragonfly");
    expect((await rejection(admin.categories.create({ name: "dragonfly" }))).code).toBe("CONFLICT");
    await admin.categories.update({ id: created.id, name: "Dragonflies", hidden: true });
    expect((await admin.categories.list()).find((c) => c.id === created.id)).toMatchObject({ name: "Dragonflies", hidden: true, sortOrder: 90 });

    const ids = (await admin.categories.list()).map((c) => c.id).reverse();
    await admin.categories.reorder({ ids });
    expect((await admin.categories.list()).map((c) => c.id)).toEqual(ids);
    expect((await rejection(admin.categories.reorder({ ids: [ids[0]!, ids[0]!] }))).code).toBe("BAD_REQUEST");
  });

  it("assigns categories to a product and warns how many products an archive affects, without touching them", async () => {
    const p = await publishedProduct("Luna Moth");
    const [moth] = (await admin.categories.list()).filter((c) => c.slug === "moth");
    await staff.products.setCategories({ productId: p.id, categoryIds: [moth!.id, moth!.id] });
    expect((await staff.products.get({ idOrSku: p.sku })).categoryIds).toEqual([moth!.id]);
    expect((await admin.categories.list()).find((c) => c.id === moth!.id)?.productCount).toBe(1);

    expect(await admin.categories.setArchived({ id: moth!.id, archived: true })).toEqual({ affectedProducts: 1 });
    expect((await admin.categories.list()).some((c) => c.id === moth!.id)).toBe(false);
    expect((await admin.categories.list({ includeArchived: true })).some((c) => c.id === moth!.id)).toBe(true);
    expect(await staff.products.get({ idOrSku: p.sku })).toMatchObject({ status: "AVAILABLE" });
    expect((await rejection(staff.products.setCategories({ productId: p.id, categoryIds: [moth!.id] }))).code).toBe("BAD_REQUEST");

    await admin.categories.setArchived({ id: moth!.id, archived: false });
    await staff.products.setCategories({ productId: p.id, categoryIds: [] });
    expect((await staff.products.get({ idOrSku: p.sku })).categoryIds).toEqual([]);
  });
});

describe("metadata", () => {
  it("has the seeded fields", async () => {
    const keys = (await staff.metadata.listFields()).map((f) => f.key);
    expect(keys).toEqual(["species", "insect_type", "collection", "frame_color", "frame_size", "creation_year", "tags", "provenance", "provenance_note"]);
  });

  it("saves typed values, shows them, and clears them", async () => {
    const p = await publishedProduct("Metadata piece");
    await staff.products.setMetadata({
      productId: p.id,
      values: { species: "Actias luna", insect_type: "moth", creation_year: 2026, provenance: "ethically sourced" },
    });
    const got = await staff.products.get({ idOrSku: p.sku });
    expect(got.metadata).toEqual([
      { key: "species", label: "Species", type: "TEXT", value: "Actias luna" },
      { key: "insect_type", label: "Insect Type", type: "SELECT", value: "Moth" },
      { key: "creation_year", label: "Creation Year", type: "YEAR", value: 2026 },
      { key: "provenance", label: "Provenance / Sourcing", type: "SELECT", value: "Ethically sourced" },
    ]);
    await staff.products.setMetadata({ productId: p.id, values: { species: null, creation_year: "" } });
    expect((await staff.products.get({ idOrSku: p.sku })).metadata.map((m) => m.key)).toEqual(["insect_type", "provenance"]);
  });

  it("saves nothing when any value is invalid", async () => {
    const p = await publishedProduct("Atomic piece");
    const bad = await rejection(staff.products.setMetadata({ productId: p.id, values: { species: "Fine", frame_color: "Chartreuse" } }));
    expect(bad.code).toBe("BAD_REQUEST");
    expect(bad.message).toMatch(/Frame Color/);
    expect((await staff.products.get({ idOrSku: p.sku })).metadata).toEqual([]);
    expect((await rejection(staff.products.setMetadata({ productId: p.id, values: { nope: "x" } }))).code).toBe("BAD_REQUEST");
  });

  it("lets an administrator define new fields, with a stable key", async () => {
    expect((await rejection(staff.metadata.createField({ label: "Era", type: "TEXT" }))).code).toBe("FORBIDDEN");
    const f = await admin.metadata.createField({ label: "Wing Span (cm)", type: "NUMBER", filterable: true });
    expect(f.key).toBe("wing_span_cm");
    const tags = (await admin.metadata.listFields()).find((x) => x.key === "tags")!;
    await admin.metadata.updateField({ id: tags.id, options: ["Rare", "rare", "Gold", ""] });
    const p = await publishedProduct("Tagged piece");
    await staff.products.setMetadata({ productId: p.id, values: { tags: ["rare", "GOLD"], wing_span_cm: "12.5" } });
    expect((await staff.products.get({ idOrSku: p.sku })).metadata.map((m) => m.value)).toEqual([["Rare", "Gold"], 12.5]);
    expect((await rejection(admin.metadata.createField({ label: "wing span (CM)", type: "TEXT" }))).code).toBe("CONFLICT");
  });

  it("adds a new choice while saving a value, only when asked to", async () => {
    const p = await publishedProduct("New choice piece");
    const refused = await rejection(staff.products.setMetadata({ productId: p.id, values: { tags: ["brand new"] } }));
    expect(refused.code).toBe("BAD_REQUEST");
    await staff.products.setMetadata({ productId: p.id, values: { tags: ["Brand New", "brand new"], insect_type: "Mantis" }, addNewChoices: true });
    const got = await staff.products.get({ idOrSku: p.sku });
    expect(got.metadata.map((m) => [m.key, m.value])).toEqual([["insect_type", "Mantis"], ["tags", ["Brand New"]]]);
    const fields = await admin.metadata.listFields();
    expect(JSON.parse(fields.find((f) => f.key === "tags")!.options)).toContain("Brand New");
    expect(JSON.parse(fields.find((f) => f.key === "insect_type")!.options)).toContain("Mantis");
    // An invalid value still rolls everything back, including the new choice.
    const bad = await rejection(staff.products.setMetadata({ productId: p.id, values: { tags: ["another one"], creation_year: "next year" }, addNewChoices: true }));
    expect(bad.code).toBe("BAD_REQUEST");
    expect(JSON.parse((await admin.metadata.listFields()).find((f) => f.key === "tags")!.options)).not.toContain("another one");
  });

  it("archiving a field hides it but keeps the stored values", async () => {
    const p = await publishedProduct("Archive field piece");
    await staff.products.setMetadata({ productId: p.id, values: { frame_size: "8 x 10 in" } });
    const field = (await admin.metadata.listFields()).find((f) => f.key === "frame_size")!;
    await admin.metadata.setFieldArchived({ id: field.id, archived: true });
    expect((await staff.products.get({ idOrSku: p.sku })).metadata).toEqual([]);
    expect((await rejection(staff.products.setMetadata({ productId: p.id, values: { frame_size: "x" } }))).code).toBe("BAD_REQUEST");
    await admin.metadata.setFieldArchived({ id: field.id, archived: false });
    expect((await staff.products.get({ idOrSku: p.sku })).metadata).toHaveLength(1);
  });

  it("shows only public fields and visible categories on the public page", async () => {
    const p = await publishedProduct("Public detail");
    const species = (await admin.metadata.listFields()).find((f) => f.key === "species")!;
    const frame = (await admin.metadata.listFields()).find((f) => f.key === "frame_color")!;
    await admin.metadata.updateField({ id: frame.id, isPublic: false });
    await staff.products.setMetadata({ productId: p.id, values: { species: "Public species", frame_color: "Gold" } });
    const cats = await admin.categories.list();
    const ids = ["beetle", "jewelry"].map((slug) => cats.find((c) => c.slug === slug)!.id);
    await admin.categories.update({ id: ids[1]!, hidden: true });
    await staff.products.setCategories({ productId: p.id, categoryIds: ids });

    const pub = await as().catalog.get({ skuOrSlug: p.sku });
    expect(pub.metadata).toEqual([{ label: species.label, value: "Public species" }]);
    expect(pub.categories).toEqual([{ name: "Beetle", slug: "beetle" }]);
    expect(JSON.stringify(pub)).not.toMatch(/Gold|Jewelry|1000/);
  });
});
