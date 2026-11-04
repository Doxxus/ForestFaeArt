import {
  categories,
  desc,
  eq,
  importBatches,
  inventoryTransactions,
  metadataFields,
  productCategories,
  productMetadataValues,
  products,
  slugRedirects,
  sql,
  and,
  inArray,
} from "@ffa/db";
import {
  buildFixCsv,
  formatSku,
  newId,
  parseImport,
  parseOptions,
  slugify,
  uniqueSlug,
  validateMetadataValue,
  type ImportContext,
  type MetadataFieldDef,
  type ParsedImport,
  type ParsedRow,
} from "@ffa/validators";
import { auditStatement } from "./audit";
import { listCategories, listMetadataFields } from "./catalogue";
import { archiveProducts, type Actor, type InventoryError } from "./inventory";
import type { Db } from "../store";

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

// A batch is one D1 call however many statements it holds, which keeps a 1,000-row import well inside the Workers
// subquery limit. 25 products is about 150 statements.
const CHUNK = 25;

export type ImportError = { ok: false; code: "INVALID" | "NOT_FOUND" | "CONFLICT"; message: string };
const fail = (code: ImportError["code"], message: string): ImportError => ({ ok: false, code, message });

async function loadContext(db: Db) {
  const [cats, fields, existing] = await Promise.all([
    listCategories(db),
    listMetadataFields(db),
    db.select({ id: products.id, externalId: products.externalId, title: products.title, priceCents: products.priceCents }).from(products).all(),
  ]);
  const ctx: ImportContext = {
    categoryNames: cats.map((c) => c.name),
    fields: fields.map((f): MetadataFieldDef => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
  };
  const byExternalId = new Map(existing.filter((p) => p.externalId).map((p) => [p.externalId!, p]));
  const titlePrice = new Set(existing.map((p) => `${p.title.trim().toLowerCase()}|${p.priceCents}`));
  return { cats, fields, ctx, byExternalId, titlePrice };
}

export interface ImportPreview {
  fileErrors: string[];
  unknownColumns: string[];
  totals: { rows: number; toCreate: number; alreadyThere: number; withErrors: number; withWarnings: number };
  newCategories: string[];
  newOptions: { fieldKey: string; fieldLabel: string; options: string[] }[];
  rows: { line: number; title: string; externalId: string | null; action: "create" | "exists" | "error"; errors: string[]; warnings: string[] }[];
  /** CSV of the failing rows with an error column, or null when every row is fine. */
  fixCsv: string | null;
}

function summarise(parsed: ParsedImport, loaded: Awaited<ReturnType<typeof loadContext>>) {
  const newCategories = new Map<string, string>();
  const newOptions = new Map<string, Map<string, string>>();
  const rows = parsed.rows.map((r) => {
    const exists = r.externalId ? loaded.byExternalId.has(r.externalId) : false;
    if (!r.externalId && r.product && loaded.titlePrice.has(`${r.product.title.toLowerCase()}|${r.product.priceCents}`)) {
      r.warnings.push("A product with this title and price already exists. With no external_id, this will be created again.");
    }
    if (!r.errors.length) {
      for (const c of r.newCategories) if (!newCategories.has(c.toLowerCase())) newCategories.set(c.toLowerCase(), c);
      for (const o of r.newOptions) {
        const m = newOptions.get(o.fieldKey) ?? new Map<string, string>();
        if (!m.has(o.option.toLowerCase())) m.set(o.option.toLowerCase(), o.option);
        newOptions.set(o.fieldKey, m);
      }
    }
    return {
      line: r.line,
      title: r.product?.title ?? "",
      externalId: r.externalId,
      action: (r.errors.length ? "error" : exists ? "exists" : "create") as "create" | "exists" | "error",
      errors: r.errors,
      warnings: r.warnings,
    };
  });
  const labels = new Map(loaded.fields.map((f) => [f.key, f.label]));
  return {
    rows,
    newCategories: [...newCategories.values()],
    newOptions: [...newOptions].map(([fieldKey, m]) => ({ fieldKey, fieldLabel: labels.get(fieldKey) ?? fieldKey, options: [...m.values()] })),
  };
}

/** Dry run (IMP-3): reads the file and reports what would happen. Nothing is written. */
export async function previewImport(db: Db, csv: string): Promise<ImportPreview> {
  const loaded = await loadContext(db);
  const parsed = parseImport(csv, loaded.ctx);
  const { rows, newCategories, newOptions } = summarise(parsed, loaded);
  return {
    fileErrors: parsed.fileErrors,
    unknownColumns: parsed.unknownColumns,
    totals: {
      rows: rows.length,
      toCreate: rows.filter((r) => r.action === "create").length,
      alreadyThere: rows.filter((r) => r.action === "exists").length,
      withErrors: rows.filter((r) => r.action === "error").length,
      withWarnings: rows.filter((r) => r.warnings.length).length,
    },
    newCategories,
    newOptions,
    rows,
    fixCsv: rows.some((r) => r.action === "error") ? buildFixCsv(parsed) : null,
  };
}

export interface ImportOptions {
  filename: string;
  /** What to do with a row whose external_id already exists (IMP-6). Updates never change stock or status. */
  existing: "skip" | "update";
  /** Add the categories and choices that don't exist yet. Without this, rows that need them are rejected. */
  createMissing: boolean;
}

export interface ImportResult {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  categoriesCreated: number;
  fixCsv: string | null;
}

const joinNotes = (r: ParsedRow) => [r.product?.notes, r.product?.soldDate ? `Sold on ${r.product.soldDate}` : null].filter(Boolean).join(" | ") || "Imported";

export async function applyImport(
  db: Db,
  actor: Actor & { id: string },
  csv: string,
  opts: ImportOptions,
): Promise<{ ok: true; result: ImportResult } | ImportError> {
  const loaded = await loadContext(db);
  const parsed = parseImport(csv, loaded.ctx);
  if (parsed.fileErrors.length) return fail("INVALID", parsed.fileErrors[0]!);

  // Rows that need something that doesn't exist yet are rejected unless the owner agreed to create it.
  if (!opts.createMissing) {
    for (const r of parsed.rows) {
      if (r.errors.length) continue;
      for (const c of r.newCategories) r.errors.push(`"${c}" isn't an existing category.`);
      for (const o of r.newOptions) r.errors.push(`"${o.option}" isn't an existing choice for ${loaded.fields.find((f) => f.key === o.fieldKey)?.label ?? o.fieldKey}.`);
      r.product = r.errors.length ? null : r.product;
    }
  }
  const good = parsed.rows.filter((r) => r.product && !r.errors.length);
  const rejected = parsed.rows.length - good.length;
  const fixCsv = rejected ? buildFixCsv(parsed) : null;
  if (!good.length) return fail("INVALID", "There are no valid rows to import. Fix the errors and try again.");

  const toUpdate = good.filter((r) => r.externalId && loaded.byExternalId.has(r.externalId));
  const toCreate = good.filter((r) => !(r.externalId && loaded.byExternalId.has(r.externalId)));
  const updated = opts.existing === "update" ? toUpdate : [];
  const skipped = toUpdate.length - updated.length;

  const batchId = newId();
  await db.insert(importBatches).values({ id: batchId, userId: actor.id, filename: opts.filename.slice(0, 200), rowCount: parsed.rows.length });

  // ---- categories and choices that were missing ----
  const categoryIds = new Map(loaded.cats.map((c) => [c.name.toLowerCase(), c.id]));
  let categoriesCreated = 0;
  const setup: Batchable[] = [];
  const fieldByKey = new Map(loaded.fields.map((f) => [f.key, f]));
  if (opts.createMissing) {
    const takenSlugs = new Set((await db.select({ slug: categories.slug }).from(categories).all()).map((c) => c.slug));
    const max = await db.select({ m: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` }).from(categories).get();
    let order = max?.m ?? 0;
    const wanted = new Map<string, string>();
    for (const r of good) for (const c of r.newCategories) if (!wanted.has(c.toLowerCase())) wanted.set(c.toLowerCase(), c);
    for (const [lower, name] of wanted) {
      if (categoryIds.has(lower)) continue;
      const slug = await uniqueSlug(slugify(name), async (s) => takenSlugs.has(s));
      takenSlugs.add(slug);
      const id = newId();
      categoryIds.set(lower, id);
      order += 10;
      categoriesCreated++;
      setup.push(db.insert(categories).values({ id, name, slug, sortOrder: order }));
    }
    const added = new Map<string, string[]>();
    for (const r of good) for (const o of r.newOptions) added.set(o.fieldKey, [...(added.get(o.fieldKey) ?? []), o.option]);
    for (const [key, extra] of added) {
      const field = fieldByKey.get(key)!;
      const merged = parseOptions(field.options);
      for (const o of extra) if (!merged.some((m) => m.toLowerCase() === o.toLowerCase())) merged.push(o);
      const options = JSON.stringify(merged);
      fieldByKey.set(key, { ...field, options } as (typeof loaded.fields)[number]);
      setup.push(db.update(metadataFields).set({ options }).where(eq(metadataFields.key, key)));
    }
  }
  if (setup.length) await runBatch(db, setup);

  const fieldIds = new Map(loaded.fields.map((f) => [f.key, f.id]));
  const metadataRows = (productId: string, r: ParsedRow) =>
    Object.entries(r.metadata).flatMap(([key, value]) => {
      const field = fieldByKey.get(key);
      if (!field) return [];
      const checked = validateMetadataValue({ key, label: field.label, type: field.type, options: field.options }, value);
      return checked.ok && checked.value !== null ? [{ productId, fieldId: fieldIds.get(key)!, value: checked.value }] : [];
    });
  const categoryRows = (productId: string, r: ParsedRow) =>
    [...r.categories, ...r.newCategories].flatMap((n) => {
      const id = categoryIds.get(n.toLowerCase());
      return id ? [{ productId, categoryId: id }] : [];
    });

  // ---- new products ----
  if (toCreate.length) {
    const first = await db.all<{ n: number }>(sql`UPDATE counter SET next_value = next_value + ${toCreate.length} WHERE key = 'sku' RETURNING next_value - ${toCreate.length} AS n`);
    const startSku = first[0]?.n;
    if (startSku === undefined) throw new Error("The sku counter is missing. Run the database migrations.");
    const taken = new Set([
      ...(await db.select({ slug: products.slug }).from(products).all()).map((p) => p.slug),
      ...(await db.select({ slug: slugRedirects.slug }).from(slugRedirects).all()).map((p) => p.slug),
    ]);

    for (let at = 0; at < toCreate.length; at += CHUNK) {
      const statements: Batchable[] = [];
      for (const [offset, r] of toCreate.slice(at, at + CHUNK).entries()) {
        const p = r.product!;
        const id = newId();
        const slug = await uniqueSlug(slugify(p.title), async (s) => taken.has(s));
        taken.add(slug);
        statements.push(
          db.insert(products).values({
            id,
            sku: formatSku(startSku + at + offset),
            slug,
            title: p.title,
            description: p.description,
            priceCents: p.priceCents,
            costCents: p.costCents,
            status: p.status,
            quantity: p.quantity,
            featured: p.featured,
            portfolioVisible: p.portfolioVisible,
            hidePrice: p.hidePrice,
            weightGrams: p.weightGrams,
            lengthMm: p.lengthMm,
            widthMm: p.widthMm,
            heightMm: p.heightMm,
            reservedNote: p.reservedNote,
            importBatchId: batchId,
            externalId: r.externalId,
            listedOnEtsy: p.etsyUrl !== null,
            etsyUrl: p.etsyUrl,
          }),
          db.insert(inventoryTransactions).values({
            id: newId(),
            productId: id,
            userId: actor.id,
            fromStatus: null,
            toStatus: p.status,
            quantityDelta: p.quantity,
            quantityAfter: p.quantity,
            notes: joinNotes(r),
            importBatchId: batchId,
            source: "IMPORT",
          }),
        );
        const cats = categoryRows(id, r);
        if (cats.length) statements.push(db.insert(productCategories).values(cats));
        const meta = metadataRows(id, r);
        if (meta.length) statements.push(db.insert(productMetadataValues).values(meta));
      }
      await runBatch(db, statements);
    }
  }

  // ---- updates to products that already exist. Stock and status are never touched here. ----
  for (let at = 0; at < updated.length; at += CHUNK) {
    const statements: Batchable[] = [];
    for (const r of updated.slice(at, at + CHUNK)) {
      const p = r.product!;
      const existingId = loaded.byExternalId.get(r.externalId!)!.id;
      statements.push(
        db
          .update(products)
          .set({
            title: p.title,
            description: p.description,
            priceCents: p.priceCents,
            costCents: p.costCents,
            featured: p.featured,
            hidePrice: p.hidePrice,
            weightGrams: p.weightGrams,
            lengthMm: p.lengthMm,
            widthMm: p.widthMm,
            heightMm: p.heightMm,
            listedOnEtsy: p.etsyUrl !== null,
            etsyUrl: p.etsyUrl,
          })
          .where(eq(products.id, existingId)),
      );
      const cats = categoryRows(existingId, r);
      if (cats.length) {
        statements.push(
          db.delete(productCategories).where(eq(productCategories.productId, existingId)),
          db.insert(productCategories).values(cats),
        );
      }
      for (const m of metadataRows(existingId, r)) {
        statements.push(db.insert(productMetadataValues).values(m).onConflictDoUpdate({ target: [productMetadataValues.productId, productMetadataValues.fieldId], set: { value: m.value } }));
      }
    }
    await runBatch(db, statements);
  }

  await runBatch(db, [
    db
      .update(importBatches)
      .set({ createdCount: toCreate.length, updatedCount: updated.length, skippedCount: skipped, errorCount: rejected })
      .where(eq(importBatches.id, batchId)),
    auditStatement(db, {
      userId: actor.id,
      action: "import.apply",
      entityType: "import_batch",
      entityId: batchId,
      diff: { filename: opts.filename, created: toCreate.length, updated: updated.length, skipped, rejected, categoriesCreated },
    }),
  ]);
  return { ok: true, result: { batchId, created: toCreate.length, updated: updated.length, skipped, rejected, categoriesCreated, fixCsv } };
}

export async function listImportBatches(db: Db) {
  return db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(50).all();
}

/** Archives everything an import created (IMP-4). Nothing is deleted, and the history stays. */
export async function undoImport(
  db: Db,
  actor: Actor & { id: string },
  batchId: string,
): Promise<{ ok: true; archived: number } | ImportError | InventoryError> {
  const batch = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) return fail("NOT_FOUND", "That import doesn't exist.");
  if (batch.status === "UNDONE") return fail("CONFLICT", "That import was already undone.");

  const items = await db
    .select({ id: products.id, status: products.status, quantity: products.quantity })
    .from(products)
    .where(and(eq(products.importBatchId, batchId), inArray(products.status, ["DRAFT", "AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT", "SOLD"])))
    .all();
  const result = await archiveProducts(db, actor, items, { note: "Import undone", importBatchId: batchId });
  if (!result.ok) return result;
  await runBatch(db, [
    db.update(importBatches).set({ status: "UNDONE", undoneAt: new Date() }).where(eq(importBatches.id, batchId)),
    auditStatement(db, { userId: actor.id, action: "import.undo", entityType: "import_batch", entityId: batchId, diff: { archived: result.archived } }),
  ]);
  return { ok: true, archived: result.archived };
}
