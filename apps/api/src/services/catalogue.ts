import {
  and,
  asc,
  categories,
  eq,
  inArray,
  isNull,
  metadataFields,
  productCategories,
  productMetadataValues,
  products,
  slugRedirects,
  sql,
} from "@ffa/db";
import {
  checkSlug,
  decodeMetadataValue,
  metadataKeyFromLabel,
  newId,
  parseOptions,
  slugify,
  uniqueSlug,
  validateMetadataValue,
  type MetadataFieldDef,
  type MetadataFieldType,
} from "@ffa/validators";
import { auditStatement } from "./audit";
import type { Db } from "../store";

export type ServiceError = { ok: false; code: "NOT_FOUND" | "CONFLICT" | "INVALID"; message: string };
const fail = (code: ServiceError["code"], message: string): ServiceError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

// ---------------------------------------------------------------------------
// Product details (not stock or status, which only inventory.ts may change)
// ---------------------------------------------------------------------------

export interface ProductPatch {
  title?: string;
  description?: string;
  slug?: string;
  priceCents?: number;
  costCents?: number | null;
  featured?: boolean;
  portfolioVisible?: boolean;
  onlineVisible?: boolean;
  onlinePurchasable?: boolean;
  hidePrice?: boolean;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  shippingClass?: string | null;
  taxCategory?: string | null;
  fragile?: boolean;
  listedOnEtsy?: boolean;
  etsyUrl?: string | null;
}

const PATCH_KEYS = [
  "title", "description", "slug", "priceCents", "costCents", "featured", "portfolioVisible", "onlineVisible",
  "onlinePurchasable", "hidePrice", "weightGrams", "lengthMm", "widthMm", "heightMm", "shippingClass", "taxCategory",
  "fragile", "listedOnEtsy", "etsyUrl",
] as const satisfies readonly (keyof ProductPatch)[];

/** Edits product details. A changed slug leaves a redirect behind so old links keep working. */
export async function updateProduct(
  db: Db,
  actorId: string,
  productId: string,
  patch: ProductPatch,
): Promise<{ ok: true; changed: string[] } | ServiceError> {
  const current = await db.select().from(products).where(eq(products.id, productId)).get();
  if (!current) return fail("NOT_FOUND", "That item doesn't exist.");

  const next: Record<string, unknown> = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of PATCH_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const normalized = key === "title" && typeof value === "string" ? value.trim() : value;
    if (normalized !== current[key]) {
      next[key] = normalized;
      diff[key] = { from: current[key], to: normalized };
    }
  }
  if (typeof next.title === "string" && !next.title) return fail("INVALID", "A title is required.");
  if (!Object.keys(next).length) return { ok: true, changed: [] };

  const statements: Batchable[] = [];
  if (typeof next.slug === "string") {
    const problem = checkSlug(next.slug);
    if (problem) return fail("INVALID", problem);
    const takenBy = await db.select({ id: products.id }).from(products).where(eq(products.slug, next.slug)).get();
    const redirect = await db.select({ productId: slugRedirects.productId }).from(slugRedirects).where(eq(slugRedirects.slug, next.slug)).get();
    if ((takenBy && takenBy.id !== productId) || (redirect && redirect.productId !== productId)) {
      return fail("CONFLICT", "Another piece already uses that web address.");
    }
    statements.push(
      db.insert(slugRedirects).values({ slug: current.slug, productId }).onConflictDoNothing(),
      db.delete(slugRedirects).where(eq(slugRedirects.slug, next.slug)),
    );
  }

  statements.unshift(db.update(products).set(next).where(eq(products.id, productId)));
  statements.push(auditStatement(db, { userId: actorId, action: "product.update", entityType: "product", entityId: productId, diff }));
  await runBatch(db, statements);
  return { ok: true, changed: Object.keys(next) };
}

// ---------------------------------------------------------------------------
// Categories (CAT-1 to CAT-4)
// ---------------------------------------------------------------------------

export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  hidden: boolean;
  archived: boolean;
  /** Products in the category that are not archived. */
  productCount: number;
}

export async function listCategories(db: Db, opts: { includeArchived?: boolean } = {}): Promise<CategoryInfo[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      sortOrder: categories.sortOrder,
      hidden: categories.hidden,
      archivedAt: categories.archivedAt,
      productCount: sql<number>`(SELECT COUNT(*) FROM product_category pc JOIN product p ON p.id = pc.product_id WHERE pc.category_id = category.id AND p.status != 'ARCHIVED')`,
    })
    .from(categories)
    .where(opts.includeArchived ? undefined : isNull(categories.archivedAt))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();
  return rows.map(({ archivedAt, ...c }) => ({ ...c, archived: archivedAt !== null }));
}

export async function createCategory(
  db: Db,
  actorId: string,
  input: { name: string; description?: string },
): Promise<{ ok: true; id: string; slug: string } | ServiceError> {
  const name = input.name.trim();
  if (!name) return fail("INVALID", "A name is required.");
  const dup = await db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = ${name.toLowerCase()}`).get();
  if (dup) return fail("CONFLICT", "There is already a category with that name.");
  const slug = await uniqueSlug(slugify(name), async (s) => Boolean(await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, s)).get()));
  const max = await db.select({ m: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` }).from(categories).get();
  const id = newId();
  await runBatch(db, [
    db.insert(categories).values({ id, name, slug, description: input.description?.trim() ?? "", sortOrder: (max?.m ?? 0) + 10 }),
    auditStatement(db, { userId: actorId, action: "category.create", entityType: "category", entityId: id, diff: { name } }),
  ]);
  return { ok: true, id, slug };
}

export async function updateCategory(
  db: Db,
  actorId: string,
  id: string,
  patch: { name?: string; description?: string; hidden?: boolean },
): Promise<{ ok: true } | ServiceError> {
  const current = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!current) return fail("NOT_FOUND", "That category doesn't exist.");
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) return fail("INVALID", "A name is required.");
  if (name && name.toLowerCase() !== current.name.toLowerCase()) {
    const dup = await db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = ${name.toLowerCase()}`).get();
    if (dup) return fail("CONFLICT", "There is already a category with that name.");
  }
  await runBatch(db, [
    db
      .update(categories)
      .set({
        ...(name ? { name } : {}),
        ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
        ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
      })
      .where(eq(categories.id, id)),
    auditStatement(db, { userId: actorId, action: "category.update", entityType: "category", entityId: id, diff: patch }),
  ]);
  return { ok: true };
}

export async function reorderCategories(db: Db, actorId: string, ids: string[]): Promise<{ ok: true } | ServiceError> {
  if (new Set(ids).size !== ids.length) return fail("INVALID", "Each category can appear once.");
  const known = await db.select({ id: categories.id }).from(categories).where(inArray(categories.id, ids)).all();
  if (known.length !== ids.length) return fail("NOT_FOUND", "One of those categories doesn't exist.");
  await runBatch(db, [
    ...ids.map((id, i) => db.update(categories).set({ sortOrder: (i + 1) * 10 }).where(eq(categories.id, id))),
    auditStatement(db, { userId: actorId, action: "category.reorder", entityType: "category", diff: { order: ids } }),
  ]);
  return { ok: true };
}

/** Archiving hides a category but never touches its products. Returns how many products are in it so the UI can warn first. */
export async function setCategoryArchived(
  db: Db,
  actorId: string,
  id: string,
  archived: boolean,
): Promise<{ ok: true; affectedProducts: number } | ServiceError> {
  const current = await listCategories(db, { includeArchived: true }).then((all) => all.find((c) => c.id === id));
  if (!current) return fail("NOT_FOUND", "That category doesn't exist.");
  await runBatch(db, [
    db.update(categories).set({ archivedAt: archived ? new Date() : null }).where(eq(categories.id, id)),
    auditStatement(db, { userId: actorId, action: archived ? "category.archive" : "category.restore", entityType: "category", entityId: id }),
  ]);
  return { ok: true, affectedProducts: current.productCount };
}

/** Replaces the whole set of categories for a product. */
export async function setProductCategories(
  db: Db,
  actorId: string,
  productId: string,
  categoryIds: string[],
): Promise<{ ok: true } | ServiceError> {
  const unique = [...new Set(categoryIds)];
  const product = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).get();
  if (!product) return fail("NOT_FOUND", "That item doesn't exist.");
  if (unique.length) {
    const found = await db.select({ id: categories.id }).from(categories).where(and(inArray(categories.id, unique), isNull(categories.archivedAt))).all();
    if (found.length !== unique.length) return fail("INVALID", "One of those categories doesn't exist or is archived.");
  }
  await runBatch(db, [
    db.delete(productCategories).where(eq(productCategories.productId, productId)),
    ...(unique.length ? [db.insert(productCategories).values(unique.map((categoryId) => ({ productId, categoryId })))] : []),
    auditStatement(db, { userId: actorId, action: "product.categories", entityType: "product", entityId: productId, diff: { categoryIds: unique } }),
  ]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Metadata fields and values (META-1 to META-6)
// ---------------------------------------------------------------------------

export interface MetadataFieldInput {
  label: string;
  type: MetadataFieldType;
  options?: string[];
  helpText?: string;
  required?: boolean;
  isPublic?: boolean;
  filterable?: boolean;
}

function cleanOptions(type: MetadataFieldType, options: string[] | undefined): string[] | ServiceError {
  if (type !== "SELECT" && type !== "MULTI_SELECT") return [];
  const out: string[] = [];
  for (const raw of options ?? []) {
    const o = raw.trim();
    if (!o) continue;
    if (o.length > 80) return fail("INVALID", "Each choice must be under 80 characters.");
    if (!out.some((x) => x.toLowerCase() === o.toLowerCase())) out.push(o);
  }
  if (out.length > 200) return fail("INVALID", "Please keep a field to 200 choices or fewer.");
  return out;
}

export async function listMetadataFields(db: Db, opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(metadataFields)
    .where(opts.includeArchived ? undefined : isNull(metadataFields.archivedAt))
    .orderBy(asc(metadataFields.sortOrder), asc(metadataFields.label))
    .all();
}

export async function createMetadataField(
  db: Db,
  actorId: string,
  input: MetadataFieldInput,
): Promise<{ ok: true; id: string; key: string } | ServiceError> {
  const label = input.label.trim();
  if (!label) return fail("INVALID", "A name is required.");
  const options = cleanOptions(input.type, input.options);
  if ("ok" in options) return options;
  const dup = await db.select({ id: metadataFields.id }).from(metadataFields).where(sql`lower(${metadataFields.label}) = ${label.toLowerCase()}`).get();
  if (dup) return fail("CONFLICT", "There is already a field with that name.");

  const base = metadataKeyFromLabel(label);
  let key = base;
  for (let n = 2; await db.select({ id: metadataFields.id }).from(metadataFields).where(eq(metadataFields.key, key)).get(); n++) key = `${base}_${n}`;
  const max = await db.select({ m: sql<number>`COALESCE(MAX(${metadataFields.sortOrder}), 0)` }).from(metadataFields).get();
  const id = newId();
  await runBatch(db, [
    db.insert(metadataFields).values({
      id,
      key,
      label,
      type: input.type,
      options: JSON.stringify(options),
      helpText: input.helpText?.trim() ?? "",
      required: input.required ?? false,
      isPublic: input.isPublic ?? true,
      filterable: input.filterable ?? false,
      sortOrder: (max?.m ?? 0) + 10,
    }),
    auditStatement(db, { userId: actorId, action: "metadata.field.create", entityType: "metadata_field", entityId: id, diff: { key, label, type: input.type } }),
  ]);
  return { ok: true, id, key };
}

/** The key and type never change, so stored values always stay valid. Removing a choice keeps values already saved with it. */
export async function updateMetadataField(
  db: Db,
  actorId: string,
  id: string,
  patch: Partial<Omit<MetadataFieldInput, "type">>,
): Promise<{ ok: true } | ServiceError> {
  const current = await db.select().from(metadataFields).where(eq(metadataFields.id, id)).get();
  if (!current) return fail("NOT_FOUND", "That field doesn't exist.");
  const label = patch.label?.trim();
  if (patch.label !== undefined && !label) return fail("INVALID", "A name is required.");
  let options: string[] | undefined;
  if (patch.options !== undefined) {
    const cleaned = cleanOptions(current.type, patch.options);
    if ("ok" in cleaned) return cleaned;
    options = cleaned;
  }
  await runBatch(db, [
    db
      .update(metadataFields)
      .set({
        ...(label ? { label } : {}),
        ...(options ? { options: JSON.stringify(options) } : {}),
        ...(patch.helpText !== undefined ? { helpText: patch.helpText.trim() } : {}),
        ...(patch.required !== undefined ? { required: patch.required } : {}),
        ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
        ...(patch.filterable !== undefined ? { filterable: patch.filterable } : {}),
      })
      .where(eq(metadataFields.id, id)),
    auditStatement(db, { userId: actorId, action: "metadata.field.update", entityType: "metadata_field", entityId: id, diff: patch }),
  ]);
  return { ok: true };
}

export async function reorderMetadataFields(db: Db, actorId: string, ids: string[]): Promise<{ ok: true } | ServiceError> {
  if (new Set(ids).size !== ids.length) return fail("INVALID", "Each field can appear once.");
  const known = await db.select({ id: metadataFields.id }).from(metadataFields).where(inArray(metadataFields.id, ids)).all();
  if (known.length !== ids.length) return fail("NOT_FOUND", "One of those fields doesn't exist.");
  await runBatch(db, [
    ...ids.map((id, i) => db.update(metadataFields).set({ sortOrder: (i + 1) * 10 }).where(eq(metadataFields.id, id))),
    auditStatement(db, { userId: actorId, action: "metadata.field.reorder", entityType: "metadata_field", diff: { order: ids } }),
  ]);
  return { ok: true };
}

/** "Removing" a field archives it, so existing values are kept (META-5). */
export async function setMetadataFieldArchived(db: Db, actorId: string, id: string, archived: boolean): Promise<{ ok: true } | ServiceError> {
  const current = await db.select({ id: metadataFields.id }).from(metadataFields).where(eq(metadataFields.id, id)).get();
  if (!current) return fail("NOT_FOUND", "That field doesn't exist.");
  await runBatch(db, [
    db.update(metadataFields).set({ archivedAt: archived ? new Date() : null }).where(eq(metadataFields.id, id)),
    auditStatement(db, { userId: actorId, action: archived ? "metadata.field.archive" : "metadata.field.restore", entityType: "metadata_field", entityId: id }),
  ]);
  return { ok: true };
}

/** Sets values by field key. A null or empty value clears it. Nothing is saved if any value is invalid. */
export async function setProductMetadata(
  db: Db,
  actorId: string,
  productId: string,
  values: Record<string, unknown>,
  opts: { addNewChoices?: boolean } = {},
): Promise<{ ok: true } | ServiceError> {
  const product = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).get();
  if (!product) return fail("NOT_FOUND", "That item doesn't exist.");
  const fields = await listMetadataFields(db);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const statements: Batchable[] = [];
  const diff: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(values)) {
    const field = byKey.get(key);
    if (!field) return fail("INVALID", `Unknown field: ${key}`);

    let working: MetadataFieldDef = field;
    if (opts.addNewChoices && (field.type === "SELECT" || field.type === "MULTI_SELECT")) {
      // A new tag or collection typed on a piece becomes a choice for everyone, in the same save.
      const existing = parseOptions(field.options);
      const wanted = (Array.isArray(input) ? input : [input]).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
      const extra = wanted.filter((v, i) => !existing.some((o) => o.toLowerCase() === v.toLowerCase()) && wanted.findIndex((w) => w.toLowerCase() === v.toLowerCase()) === i);
      if (extra.length) {
        if (extra.some((v) => v.length > 80) || existing.length + extra.length > 200) return fail("INVALID", `${field.label}: that choice is too long, or there are too many choices.`);
        const options = JSON.stringify([...existing, ...extra]);
        working = { ...field, options };
        statements.push(db.update(metadataFields).set({ options }).where(eq(metadataFields.id, field.id)));
      }
    }

    const result = validateMetadataValue(working, input);
    if (!result.ok) return fail("INVALID", result.message);
    diff[key] = result.value;
    statements.push(
      result.value === null
        ? db.delete(productMetadataValues).where(and(eq(productMetadataValues.productId, productId), eq(productMetadataValues.fieldId, field.id)))
        : db
            .insert(productMetadataValues)
            .values({ productId, fieldId: field.id, value: result.value })
            .onConflictDoUpdate({ target: [productMetadataValues.productId, productMetadataValues.fieldId], set: { value: result.value } }),
    );
  }
  if (!statements.length) return { ok: true };
  statements.push(auditStatement(db, { userId: actorId, action: "product.metadata", entityType: "product", entityId: productId, diff }));
  await runBatch(db, statements);
  return { ok: true };
}

export async function getProductMetadata(db: Db, productId: string, opts: { publicOnly?: boolean } = {}) {
  const rows = await db
    .select({
      key: metadataFields.key,
      label: metadataFields.label,
      type: metadataFields.type,
      value: productMetadataValues.value,
      sortOrder: metadataFields.sortOrder,
    })
    .from(productMetadataValues)
    .innerJoin(metadataFields, eq(metadataFields.id, productMetadataValues.fieldId))
    .where(
      and(
        eq(productMetadataValues.productId, productId),
        isNull(metadataFields.archivedAt),
        opts.publicOnly ? eq(metadataFields.isPublic, true) : undefined,
      ),
    )
    .orderBy(asc(metadataFields.sortOrder))
    .all();
  return rows.map((r) => ({ key: r.key, label: r.label, type: r.type, value: decodeMetadataValue(r.type, r.value) }));
}

export async function getProductCategoryIds(db: Db, productId: string): Promise<string[]> {
  const rows = await db.select({ id: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, productId)).all();
  return rows.map((r) => r.id);
}
