import { asc, contentBlocks, eq } from "@ffa/db";
import { isPlaceholderText } from "@ffa/validators";
import { auditStatement } from "./audit";
import { mediaPath, removeImageFile, storeSingleImage, type ImageError } from "./images";
import type { Db } from "../store";

/** The pages the owner can edit. They are created by a migration, so there is nothing to add or delete. */
export const CONTENT_KEYS = ["about", "home_teaser", "contact", "privacy", "terms"] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];
export const isContentKey = (key: string): key is ContentKey => (CONTENT_KEYS as readonly string[]).includes(key);

export type ContentError = { ok: false; code: "NOT_FOUND" | "INVALID"; message: string };
const fail = (code: ContentError["code"], message: string): ContentError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

export async function listContent(db: Db) {
  const rows = await db.select().from(contentBlocks).orderBy(asc(contentBlocks.key)).all();
  rows.sort((a, b) => CONTENT_KEYS.indexOf(a.key as ContentKey) - CONTENT_KEYS.indexOf(b.key as ContentKey));
  return rows.map((b) => ({
    key: b.key,
    title: b.title,
    isDraft: b.isDraft,
    placeholder: isPlaceholderText(b.body) || isPlaceholderText(b.title),
    hasImage: b.imageKey !== null,
    updatedAt: b.updatedAt,
  }));
}

export async function getContent(db: Db, key: string) {
  const b = await db.select().from(contentBlocks).where(eq(contentBlocks.key, key)).get();
  if (!b) return null;
  return { id: b.id, key: b.key, title: b.title, body: b.body, isDraft: b.isDraft, placeholder: isPlaceholderText(b.body), imagePath: b.imageKey ? mediaPath(b.imageKey) : null, updatedAt: b.updatedAt };
}

export async function updateContent(
  db: Db,
  actorId: string,
  key: string,
  patch: { title?: string; body?: string; isDraft?: boolean },
): Promise<{ ok: true } | ContentError> {
  const current = await db.select({ id: contentBlocks.id }).from(contentBlocks).where(eq(contentBlocks.key, key)).get();
  if (!current) return fail("NOT_FOUND", "That page doesn't exist.");
  if (patch.title !== undefined && !patch.title.trim()) return fail("INVALID", "A page needs a title.");
  await runBatch(db, [
    db
      .update(contentBlocks)
      .set({
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        // Editing the words means the owner has looked at them, unless they say it is still a draft.
        isDraft: patch.isDraft ?? (patch.body !== undefined ? false : undefined),
      })
      .where(eq(contentBlocks.id, current.id)),
    auditStatement(db, { userId: actorId, action: "content.update", entityType: "content_block", entityId: current.id, diff: { key, title: patch.title, isDraft: patch.isDraft } }),
  ]);
  return { ok: true };
}

export async function setContentImage(
  db: Db,
  bucket: R2Bucket,
  actorId: string,
  key: string,
  bytes: Uint8Array,
): Promise<{ ok: true; path: string } | ContentError | ImageError> {
  const b = await db.select({ id: contentBlocks.id, imageKey: contentBlocks.imageKey }).from(contentBlocks).where(eq(contentBlocks.key, key)).get();
  if (!b) return fail("NOT_FOUND", "That page doesn't exist.");
  const stored = await storeSingleImage(bucket, "content", b.id, bytes);
  if (!stored.ok) return stored;
  await runBatch(db, [
    db.update(contentBlocks).set({ imageKey: stored.key }).where(eq(contentBlocks.id, b.id)),
    auditStatement(db, { userId: actorId, action: "content.image", entityType: "content_block", entityId: b.id, diff: { key } }),
  ]);
  await removeImageFile(bucket, b.imageKey);
  return { ok: true, path: mediaPath(stored.key) };
}

export async function removeContentImage(db: Db, bucket: R2Bucket, actorId: string, key: string): Promise<{ ok: true } | ContentError> {
  const b = await db.select({ id: contentBlocks.id, imageKey: contentBlocks.imageKey }).from(contentBlocks).where(eq(contentBlocks.key, key)).get();
  if (!b) return fail("NOT_FOUND", "That page doesn't exist.");
  await runBatch(db, [
    db.update(contentBlocks).set({ imageKey: null }).where(eq(contentBlocks.id, b.id)),
    auditStatement(db, { userId: actorId, action: "content.image.remove", entityType: "content_block", entityId: b.id, diff: { key } }),
  ]);
  await removeImageFile(bucket, b.imageKey);
  return { ok: true };
}
