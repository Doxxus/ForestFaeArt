import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, splitStatements, type TestDb } from "./d1";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
afterAll(async () => {
  await db?.dispose();
});

const now = Date.now();
const insertProduct = (id: string, sku: string, status: string, quantity: number) =>
  db.d1
    .prepare(
      "INSERT INTO product (id, sku, slug, title, status, quantity, created_at, updated_at) VALUES (?, ?, ?, 'T', ?, ?, ?, ?)",
    )
    .bind(id, sku, sku.toLowerCase(), status, quantity, now, now)
    .run();

describe("splitStatements", () => {
  it("keeps trigger bodies in one statement", () => {
    const parts = splitStatements("CREATE TABLE a (x);\nCREATE TRIGGER t BEFORE DELETE ON a\nBEGIN\n  SELECT 1;\nEND;\nINSERT INTO a VALUES (1);");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain("SELECT 1;");
  });
});

describe("migrations and reference data", () => {
  it("seed the default categories, metadata fields and counters", async () => {
    const cats = await db.d1.prepare("SELECT slug FROM category ORDER BY sort_order").all<{ slug: string }>();
    expect(cats.results.map((c) => c.slug)).toEqual([
      "butterfly",
      "moth",
      "beetle",
      "jewelry",
      "taxidermy",
      "featured",
      "collection",
      "limited-edition",
    ]);
    const fields = await db.d1.prepare("SELECT key FROM metadata_field").all<{ key: string }>();
    expect(fields.results.map((f) => f.key)).toEqual(
      expect.arrayContaining(["species", "insect_type", "collection", "frame_color", "frame_size", "creation_year", "tags", "provenance"]),
    );
    const sku = await db.d1.prepare("SELECT next_value FROM counter WHERE key = 'sku'").first<{ next_value: number }>();
    expect(sku?.next_value).toBe(1);
  });
});

describe("database guards", () => {
  it("refuses a negative quantity", async () => {
    await expect(insertProduct("P_NEG", "FFA-900001", "AVAILABLE", -1)).rejects.toThrow();
  });
  it("refuses a stocked status with no stock, and SOLD with stock", async () => {
    await expect(insertProduct("P_A0", "FFA-900002", "AVAILABLE", 0)).rejects.toThrow();
    await expect(insertProduct("P_S1", "FFA-900003", "SOLD", 1)).rejects.toThrow();
    await insertProduct("P_OK1", "FFA-900004", "SOLD", 0);
    await insertProduct("P_OK2", "FFA-900005", "DRAFT", 0);
  });
  it("refuses an unknown status", async () => {
    await expect(insertProduct("P_BAD", "FFA-900006", "LOST", 1)).rejects.toThrow();
  });
  it("refuses duplicate SKUs", async () => {
    await insertProduct("P_D1", "FFA-900007", "AVAILABLE", 1);
    await expect(
      db.d1
        .prepare("INSERT INTO product (id, sku, slug, title, status, quantity, created_at, updated_at) VALUES ('P_D2', 'FFA-900007', 'other', 'T', 'AVAILABLE', 1, 1, 1)")
        .run(),
    ).rejects.toThrow();
  });
  it("never hard-deletes a product", async () => {
    await insertProduct("P_DEL", "FFA-900008", "AVAILABLE", 1);
    await expect(db.d1.prepare("DELETE FROM product WHERE id = 'P_DEL'").run()).rejects.toThrow(/archived/);
  });
  it("keeps the inventory ledger and audit log append-only", async () => {
    await insertProduct("P_LED", "FFA-900009", "AVAILABLE", 1);
    await db.d1
      .prepare("INSERT INTO inventory_transaction (id, product_id, at, to_status, quantity_after, source) VALUES ('TX1', 'P_LED', 1, 'AVAILABLE', 1, 'SYSTEM')")
      .run();
    await expect(db.d1.prepare("UPDATE inventory_transaction SET notes = 'x' WHERE id = 'TX1'").run()).rejects.toThrow(/append-only/);
    await expect(db.d1.prepare("DELETE FROM inventory_transaction WHERE id = 'TX1'").run()).rejects.toThrow(/append-only/);
    await db.d1.prepare("INSERT INTO audit_log (id, at, action, entity_type) VALUES ('A1', 1, 'x', 'y')").run();
    await expect(db.d1.prepare("UPDATE audit_log SET action = 'z'").run()).rejects.toThrow(/append-only/);
    await expect(db.d1.prepare("DELETE FROM audit_log").run()).rejects.toThrow(/append-only/);
  });
  it("lets a sample product and its ledger rows be deleted, and nothing else (migration 0007)", async () => {
    await insertProduct("P_SMP", "FFA-900020", "AVAILABLE", 1);
    await db.d1.prepare("UPDATE product SET is_sample = 1 WHERE id = 'P_SMP'").run();
    await db.d1
      .prepare("INSERT INTO inventory_transaction (id, product_id, at, to_status, quantity_after, source) VALUES ('TX_SMP', 'P_SMP', 1, 'AVAILABLE', 1, 'SYSTEM')")
      .run();
    // The ledger itself stays append-only for sample pieces too: rows can go, but never be edited.
    await expect(db.d1.prepare("UPDATE inventory_transaction SET notes = 'x' WHERE id = 'TX_SMP'").run()).rejects.toThrow(/append-only/);
    await db.d1.prepare("DELETE FROM inventory_transaction WHERE id = 'TX_SMP'").run();
    await db.d1.prepare("DELETE FROM product WHERE id = 'P_SMP'").run();
    expect(await db.d1.prepare("SELECT COUNT(*) AS n FROM product WHERE id = 'P_SMP'").first<{ n: number }>()).toEqual({ n: 0 });
  });
  it("still refuses to delete a real product or its ledger rows once the sample exception exists", async () => {
    await insertProduct("P_REAL", "FFA-900021", "AVAILABLE", 1);
    await db.d1
      .prepare("INSERT INTO inventory_transaction (id, product_id, at, to_status, quantity_after, source) VALUES ('TX_REAL', 'P_REAL', 1, 'AVAILABLE', 1, 'SYSTEM')")
      .run();
    await expect(db.d1.prepare("DELETE FROM inventory_transaction WHERE product_id = 'P_REAL'").run()).rejects.toThrow(/append-only/);
    await expect(db.d1.prepare("DELETE FROM product WHERE id = 'P_REAL'").run()).rejects.toThrow(/archived/);
    // Only the sample-data loader ever sets is_sample, and no screen or API call can flip it on an existing piece.
  });
  it("allows only one primary image per product", async () => {
    await insertProduct("P_IMG", "FFA-900010", "AVAILABLE", 1);
    const ins = (id: string, key: string, primary: number) =>
      db.d1.prepare("INSERT INTO product_image (id, product_id, r2_key, is_primary, created_at) VALUES (?, 'P_IMG', ?, ?, 1)").bind(id, key, primary).run();
    await ins("I1", "k1", 1);
    await ins("I2", "k2", 0);
    await expect(ins("I3", "k3", 1)).rejects.toThrow();
  });
  it("enforces foreign keys", async () => {
    await expect(
      db.d1.prepare("INSERT INTO product_category (product_id, category_id) VALUES ('nope', 'nope')").run(),
    ).rejects.toThrow();
  });
  it("makes sale idempotency keys unique", async () => {
    await db.d1.prepare("INSERT INTO user (id, email, name, role, created_at, updated_at) VALUES ('U1', 'a@b.c', 'A', 'ADMIN', 1, 1)").run();
    const sale = (id: string, num: number, key: string) =>
      db.d1
        .prepare(
          "INSERT INTO sale (id, number, channel, sold_by_user_id, subtotal_cents, total_cents, idempotency_key, occurred_at, created_at) VALUES (?, ?, 'MARKET', 'U1', 100, 100, ?, 1, 1)",
        )
        .bind(id, num, key)
        .run();
    await sale("S1", 1, "key-1");
    await expect(sale("S2", 2, "key-1")).rejects.toThrow();
  });
});
