import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { sql, users } from "@ffa/db";
import { IMPORT_TEMPLATE_CSV, parseCsv } from "@ffa/validators";
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
const count = async (table: string) => (await db.all<{ n: number }>(sql.raw(`SELECT COUNT(*) AS n FROM ${table}`)))[0]!.n;

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "http://localhost:3000" };
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

describe("preview (dry run)", () => {
  it("reports what the template would do without writing anything", async () => {
    const p = await admin.import.preview({ csv: IMPORT_TEMPLATE_CSV });
    expect(p.fileErrors).toEqual([]);
    expect(p.totals).toEqual({ rows: 2, toCreate: 2, alreadyThere: 0, withErrors: 0, withWarnings: 0 });
    expect(p.newCategories).toEqual([]);
    expect(p.newOptions).toEqual([
      { fieldKey: "collection", fieldLabel: "Collection", options: ["Forest Collection"] },
      { fieldKey: "tags", fieldLabel: "Tags", options: ["blue", "iridescent", "pendant", "green"] },
    ]);
    expect(p.rows.map((r) => [r.line, r.title, r.action])).toEqual([[2, "Blue Morpho Shadowbox", "create"], [5, "Luna Moth Necklace", "create"]]);
    expect(p.fixCsv).toBeNull();
    expect(await count("product")).toBe(0);
    expect(await count("import_batch")).toBe(0);
  });

  it("provides the template and keeps import to administrators", async () => {
    expect((await admin.import.template()).csv).toBe(IMPORT_TEMPLATE_CSV);
    for (const call of [() => staff.import.preview({ csv: "a" }), () => staff.import.run({ csv: "a" }), () => staff.import.undo({ batchId: "x" }), () => staff.import.batches(), () => staff.import.template()]) {
      expect((await rejection(call())).code).toBe("FORBIDDEN");
    }
    expect((await rejection(as().import.preview({ csv: "a" }))).code).toBe("UNAUTHORIZED");
  });
});

describe("importing", () => {
  it("rejects rows that need new categories or choices unless the owner agrees", async () => {
    const error = await rejection(admin.import.run({ csv: IMPORT_TEMPLATE_CSV }));
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toMatch(/no valid rows/);
    expect(await count("product")).toBe(0);
  });

  let batchId: string;
  it("creates products, categories, metadata and history, and adds the new choices", async () => {
    const r = await admin.import.run({ csv: IMPORT_TEMPLATE_CSV, filename: "inventory.csv", createMissing: true });
    batchId = r.batchId;
    expect(r).toMatchObject({ created: 2, updated: 0, skipped: 0, rejected: 0, categoriesCreated: 0, fixCsv: null });

    const { items } = await admin.products.list({ sort: "sku" });
    expect(items.map((i) => [i.sku, i.title, i.status, i.quantity, i.priceCents, "costCents" in i ? i.costCents : undefined])).toEqual([
      ["FFA-000001", "Blue Morpho Shadowbox", "AVAILABLE", 1, 12000, 4500],
      ["FFA-000002", "Luna Moth Necklace", "AVAILABLE", 3, 3500, 1200],
    ]);
    expect(items[0]).toMatchObject({ portfolioVisible: false, featured: true, listedOnEtsy: true, etsyUrl: "https://www.etsy.com/ca/listing/0000000000/blue-morpho-shadowbox", slug: "blue-morpho-shadowbox" });
    expect(items[1]).toMatchObject({ listedOnEtsy: false, featured: false });
    expect(items.every((i) => i.imageCount === 0)).toBe(true);

    const first = await admin.products.get({ idOrSku: "FFA-000001" });
    expect(first.description).toBe("Iridescent blue morpho in a handmade wooden shadowbox.\n\nMounted on moss with dried botanicals.");
    const cats = await admin.categories.list();
    expect(first.categoryIds.sort()).toEqual(["Butterfly", "Collection"].map((n) => cats.find((c) => c.name === n)!.id).sort());
    expect(first.metadata.map((m) => [m.key, m.value])).toEqual([
      ["species", "Morpho menelaus"],
      ["insect_type", "Butterfly"],
      ["collection", "Forest Collection"],
      ["frame_color", "Walnut"],
      ["frame_size", "8x10 in"],
      ["creation_year", 2025],
      ["tags", ["blue", "iridescent"]],
      ["provenance", "Ethically sourced"],
      ["provenance_note", "Farm-raised and ethically sourced"],
    ]);
    const fields = await admin.metadata.listFields();
    expect(JSON.parse(fields.find((f) => f.key === "collection")!.options)).toEqual(["Forest Collection"]);
    expect(JSON.parse(fields.find((f) => f.key === "tags")!.options)).toEqual(["blue", "iridescent", "pendant", "green"]);

    const tx = await db.all<{ source: string; import_batch_id: string; to_status: string; quantity_after: number; notes: string }>(
      sql`SELECT source, import_batch_id, to_status, quantity_after, notes FROM inventory_transaction ORDER BY quantity_after`,
    );
    expect(tx).toEqual([
      { source: "IMPORT", import_batch_id: batchId, to_status: "AVAILABLE", quantity_after: 1, notes: "Display piece from spring batch" },
      { source: "IMPORT", import_batch_id: batchId, to_status: "AVAILABLE", quantity_after: 3, notes: "Imported" },
    ]);
    const batches = await admin.import.batches();
    expect(batches[0]).toMatchObject({ id: batchId, filename: "inventory.csv", rowCount: 2, createdCount: 2, status: "APPLIED" });
    expect((await staff.inventory.summary()).needsPhotos).toBe(2);
  });

  it("is idempotent by external_id: re-importing skips existing rows", async () => {
    const r = await admin.import.run({ csv: IMPORT_TEMPLATE_CSV, createMissing: true });
    expect(r).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    expect(await count("product")).toBe(2);
    const p = await admin.import.preview({ csv: IMPORT_TEMPLATE_CSV });
    expect(p.totals).toMatchObject({ toCreate: 0, alreadyThere: 2 });
  });

  it("can update existing rows, and never changes their stock or status", async () => {
    await admin.products.changeStatus({ productId: (await admin.products.get({ idOrSku: "FFA-000001" })).id, to: "RESERVED", reason: "held" });
    const csv = IMPORT_TEMPLATE_CSV.replace("120.00", "150.00").replace("Blue Morpho Shadowbox", "Blue Morpho Shadowbox (framed)").replace(",1,available,Butterfly", ",9,sold,Moth");
    const r = await admin.import.run({ csv, existing: "update", createMissing: true });
    expect(r).toMatchObject({ created: 0, updated: 2, skipped: 0 });
    const got = await admin.products.get({ idOrSku: "FFA-000001" });
    expect(got).toMatchObject({ title: "Blue Morpho Shadowbox (framed)", priceCents: 15000, status: "RESERVED", quantity: 1, slug: "blue-morpho-shadowbox" });
    expect(got.categoryIds).toHaveLength(2); // Moth + Collection
  });

  it("imports the good rows, skips the bad ones, and hands back a fix-it file", async () => {
    const csv = "external_id,title,price,quantity,status\nm1,Good one,10,1,available\nm2,Bad price,abc,1,available\nm3,Sold out one,20,0,available\nm4,,5,1,available\nm5,Reserved one,30,2,reserved\n";
    const r = await admin.import.run({ csv, filename: "mixed.csv" });
    expect(r).toMatchObject({ created: 3, rejected: 2 });
    const fix = parseCsv(r.fixCsv!).map((x) => x.cells);
    expect(fix.map((x) => x[0])).toEqual(["external_id", "m2", "m4"]);
    expect(fix[0]!.at(-1)).toBe("error");
    expect(fix[1]!.at(-1)).toMatch(/valid price/);

    const list = await admin.products.list({ q: "one", sort: "title" });
    expect(list.items.map((i) => [i.title, i.status, i.quantity])).toEqual([
      ["Good one", "AVAILABLE", 1],
      ["Reserved one", "RESERVED", 2],
      ["Sold out one", "SOLD", 0],
    ]);
  });

  it("warns about a likely duplicate when there is no external_id", async () => {
    const p = await admin.import.preview({ csv: "title,price\nGood one,10\nNew thing,10\n" });
    expect(p.rows[0]!.warnings[0]).toMatch(/already exists/);
    expect(p.rows[1]!.warnings).toEqual([]);
    expect(p.totals.withWarnings).toBe(1);
  });

  it("creates new categories and choices when allowed, with unique slugs", async () => {
    const csv = "title,price,categories,insect_type\nDragon,5,Dragonfly; Framed,Mantis\nFly,6,dragonfly,\n";
    const preview = await admin.import.preview({ csv });
    expect(preview.newCategories).toEqual(["Dragonfly", "Framed"]);
    expect(preview.newOptions).toEqual([{ fieldKey: "insect_type", fieldLabel: "Insect Type", options: ["Mantis"] }]);
    const r = await admin.import.run({ csv, createMissing: true });
    expect(r).toMatchObject({ created: 2, categoriesCreated: 2 });
    const cats = await admin.categories.list();
    expect(cats.filter((c) => ["Dragonfly", "Framed"].includes(c.name)).map((c) => [c.name, c.slug, c.productCount])).toEqual([["Dragonfly", "dragonfly", 2], ["Framed", "framed", 1]]);
  });
});

describe("undoing an import", () => {
  it("archives everything the import made, keeps the history, and only works once", async () => {
    const before = await count("product");
    const csv = "external_id,title,price,status\nu1,Undo A,5,available\nu2,Undo B,6,sold\nu3,Undo C,7,draft\n";
    const r = await admin.import.run({ csv, filename: "undo.csv" });
    expect(r.created).toBe(3);
    // One of them is already archived by hand, so only two are affected.
    const c = await admin.products.get({ idOrSku: (await admin.products.list({ q: "Undo C" })).items[0]!.sku });
    await admin.products.changeStatus({ productId: c.id, to: "ARCHIVED" });

    expect(await admin.import.undo({ batchId: r.batchId })).toEqual({ archived: 2 });
    expect(await count("product")).toBe(before + 3); // nothing deleted
    expect((await admin.products.list({ q: "Undo" })).total).toBe(0); // hidden from the list
    expect((await admin.products.list({ q: "Undo", includeArchived: true })).items.every((i) => i.status === "ARCHIVED")).toBe(true);
    expect((await admin.import.batches()).find((b) => b.id === r.batchId)).toMatchObject({ status: "UNDONE" });

    const ledger = await db.all<{ notes: string; to_status: string }>(sql`SELECT notes, to_status FROM inventory_transaction WHERE import_batch_id = ${r.batchId} AND notes = 'Import undone'`);
    expect(ledger).toHaveLength(2);
    expect((await rejection(admin.import.undo({ batchId: r.batchId }))).code).toBe("CONFLICT");
    expect((await rejection(admin.import.undo({ batchId: "nope" }))).code).toBe("NOT_FOUND");
  });
});

describe("bigger files", () => {
  it("imports hundreds of rows in chunks with unique SKUs and slugs", async () => {
    const rows = Array.from({ length: 260 }, (_, i) => `big-${i},Same Title,${(i % 50) + 1}.50,${(i % 3) + 1}`);
    const csv = ["external_id,title,price,quantity", ...rows].join("\n");
    const p = await admin.import.preview({ csv });
    expect(p.totals.toCreate).toBe(260);
    const started = Date.now();
    const r = await admin.import.run({ csv, filename: "big.csv" });
    expect(r.created).toBe(260);
    expect(Date.now() - started).toBeLessThan(20_000);
    const skus = await db.all<{ sku: string; slug: string }>(sql`SELECT sku, slug FROM product WHERE external_id LIKE 'big-%'`);
    expect(new Set(skus.map((s) => s.sku)).size).toBe(260);
    expect(new Set(skus.map((s) => s.slug)).size).toBe(260);
    expect(skus.some((s) => s.slug === "same-title")).toBe(true);
    expect(skus.some((s) => s.slug === "same-title-260")).toBe(true);
    const next = await admin.products.create({ title: "After import" });
    expect(Number(next.sku.slice(4))).toBeGreaterThan(Math.max(...skus.map((s) => Number(s.sku.slice(4)))));
  }, 60_000);

  it("refuses a file with more than 1,000 rows or a missing column", async () => {
    const big = "title,price\n" + Array.from({ length: 1001 }, (_, i) => `T${i},1`).join("\n");
    expect((await admin.import.preview({ csv: big })).fileErrors[0]).toMatch(/at most 1000/);
    expect((await rejection(admin.import.run({ csv: big }))).message).toMatch(/at most 1000/);
    expect((await rejection(admin.import.run({ csv: "title,qty\nA,1\n" }))).message).toMatch(/"price" column/);
  });
});
