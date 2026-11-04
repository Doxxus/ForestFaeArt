import { and, asc, eq, productImages, products, sql } from "@ffa/db";
import { newId } from "@ffa/validators";
import { IMAGE_TYPES, InvalidImageError, cleanImage } from "../media/image";
import { auditStatement } from "./audit";
import type { Db } from "../store";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 12;
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export type ImageError = { ok: false; code: "NOT_FOUND" | "INVALID" | "TOO_LARGE" | "LIMIT"; message: string };
const fail = (code: ImageError["code"], message: string): ImageError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

export interface ProductImageInfo {
  id: string;
  /** Path under the API origin, for example /media/products/<product>/<image>.jpg. Add ?w=640 for a resized copy. */
  path: string;
  altText: string;
  isPrimary: boolean;
  width: number | null;
  height: number | null;
}

export const mediaPath = (r2Key: string) => `/media/${r2Key}`;

export type SingleImageArea = "events" | "content";

/**
 * Stores the one picture that belongs to an event or a page: checks and cleans it like a product photo and returns its key.
 * The caller saves the key and then removes the old file with `removeImageFile`.
 */
export async function storeSingleImage(
  bucket: R2Bucket,
  area: SingleImageArea,
  ownerId: string,
  bytes: Uint8Array,
): Promise<{ ok: true; key: string; width: number; height: number } | ImageError> {
  if (bytes.length === 0) return fail("INVALID", "That file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) return fail("TOO_LARGE", `That photo is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Please choose a smaller one.`);
  let clean;
  try {
    clean = cleanImage(bytes);
  } catch (error) {
    if (error instanceof InvalidImageError) return fail("INVALID", error.message);
    throw error;
  }
  const type = IMAGE_TYPES[clean.kind];
  const key = `${area}/${ownerId}/${newId()}.${type.ext}`;
  await bucket.put(key, clean.bytes, { httpMetadata: { contentType: type.contentType, cacheControl: IMMUTABLE_CACHE } });
  return { ok: true, key, width: clean.width, height: clean.height };
}

export async function removeImageFile(bucket: R2Bucket, key: string | null | undefined): Promise<void> {
  if (key) await bucket.delete(key).catch(() => undefined);
}

const toInfo = (r: typeof productImages.$inferSelect): ProductImageInfo => ({
  id: r.id,
  path: mediaPath(r.r2Key),
  altText: r.altText,
  isPrimary: r.isPrimary,
  width: r.width,
  height: r.height,
});

export async function listProductImages(db: Db, productId: string): Promise<ProductImageInfo[]> {
  const rows = await db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id)).all();
  return rows.map(toInfo);
}

/** Checks, cleans and stores one photo. The first photo of a product becomes its primary image (IMG-1). */
export async function addProductImage(
  db: Db,
  bucket: R2Bucket,
  actorId: string,
  input: { productId: string; bytes: Uint8Array; altText?: string },
): Promise<{ ok: true; image: ProductImageInfo } | ImageError> {
  if (input.bytes.length === 0) return fail("INVALID", "That file is empty.");
  if (input.bytes.length > MAX_UPLOAD_BYTES) return fail("TOO_LARGE", `That photo is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Please choose a smaller one.`);

  const product = await db.select({ id: products.id, title: products.title }).from(products).where(eq(products.id, input.productId)).get();
  if (!product) return fail("NOT_FOUND", "That item doesn't exist.");
  const existing = await db
    .select({ n: sql<number>`COUNT(*)`, max: sql<number>`COALESCE(MAX(${productImages.sortOrder}), 0)` })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .get();
  if ((existing?.n ?? 0) >= MAX_IMAGES_PER_PRODUCT) return fail("LIMIT", `A piece can have up to ${MAX_IMAGES_PER_PRODUCT} photos.`);

  let clean;
  try {
    clean = cleanImage(input.bytes);
  } catch (error) {
    if (error instanceof InvalidImageError) return fail("INVALID", error.message);
    throw error;
  }

  const id = newId();
  const type = IMAGE_TYPES[clean.kind];
  const r2Key = `products/${product.id}/${id}.${type.ext}`;
  await bucket.put(r2Key, clean.bytes, { httpMetadata: { contentType: type.contentType, cacheControl: IMMUTABLE_CACHE } });

  const altText = (input.altText?.trim() || product.title).slice(0, 300);
  const first = (existing?.n ?? 0) === 0;
  try {
    await runBatch(db, [
      db.insert(productImages).values({
        id,
        productId: product.id,
        r2Key,
        altText,
        sortOrder: (existing?.max ?? 0) + 1,
        isPrimary: first,
        width: clean.width,
        height: clean.height,
        contentType: type.contentType,
        byteSize: clean.bytes.length,
      }),
      auditStatement(db, { userId: actorId, action: "image.add", entityType: "product", entityId: product.id, diff: { imageId: id, bytes: clean.bytes.length } }),
    ]);
  } catch (error) {
    await bucket.delete(r2Key).catch(() => undefined);
    throw error;
  }
  const row = await db.select().from(productImages).where(eq(productImages.id, id)).get();
  return { ok: true, image: toInfo(row!) };
}

async function loadImage(db: Db, productId: string, imageId: string) {
  return db.select().from(productImages).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId))).get();
}

export async function setImageAlt(db: Db, actorId: string, productId: string, imageId: string, altText: string): Promise<{ ok: true } | ImageError> {
  if (!(await loadImage(db, productId, imageId))) return fail("NOT_FOUND", "That photo doesn't exist.");
  await runBatch(db, [
    db.update(productImages).set({ altText: altText.trim().slice(0, 300) }).where(eq(productImages.id, imageId)),
    auditStatement(db, { userId: actorId, action: "image.alt", entityType: "product", entityId: productId, diff: { imageId } }),
  ]);
  return { ok: true };
}

/** The partial unique index allows one primary per product, so the old one is cleared first in the same batch. */
export async function setPrimaryImage(db: Db, actorId: string, productId: string, imageId: string): Promise<{ ok: true } | ImageError> {
  if (!(await loadImage(db, productId, imageId))) return fail("NOT_FOUND", "That photo doesn't exist.");
  await runBatch(db, [
    db.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, productId)),
    db.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId)),
    auditStatement(db, { userId: actorId, action: "image.primary", entityType: "product", entityId: productId, diff: { imageId } }),
  ]);
  return { ok: true };
}

/** `imageIds` must be exactly the product's photos, in the new order. */
export async function reorderImages(db: Db, actorId: string, productId: string, imageIds: string[]): Promise<{ ok: true } | ImageError> {
  const current = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId)).all();
  const same = current.length === imageIds.length && new Set(imageIds).size === imageIds.length && current.every((c) => imageIds.includes(c.id));
  if (!same) return fail("INVALID", "The photo list is out of date. Please refresh and try again.");
  await runBatch(db, [
    ...imageIds.map((id, i) => db.update(productImages).set({ sortOrder: i + 1 }).where(eq(productImages.id, id))),
    auditStatement(db, { userId: actorId, action: "image.reorder", entityType: "product", entityId: productId }),
  ]);
  return { ok: true };
}

/** Removes the photo and its file. If it was the primary, the next photo takes over. */
export async function deleteImage(db: Db, bucket: R2Bucket, actorId: string, productId: string, imageId: string): Promise<{ ok: true } | ImageError> {
  const image = await loadImage(db, productId, imageId);
  if (!image) return fail("NOT_FOUND", "That photo doesn't exist.");
  await runBatch(db, [
    db.delete(productImages).where(eq(productImages.id, imageId)),
    db
      .update(productImages)
      .set({ isPrimary: true })
      .where(
        and(
          eq(productImages.id, sql`(SELECT id FROM product_image WHERE product_id = ${productId} ORDER BY sort_order, id LIMIT 1)`),
          sql`NOT EXISTS (SELECT 1 FROM product_image WHERE product_id = ${productId} AND is_primary = 1)`,
        ),
      ),
    auditStatement(db, { userId: actorId, action: "image.delete", entityType: "product", entityId: productId, diff: { imageId } }),
  ]);
  await bucket.delete(image.r2Key).catch(() => undefined);
  return { ok: true };
}
