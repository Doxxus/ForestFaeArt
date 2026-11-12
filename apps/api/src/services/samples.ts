import {
  and,
  eq,
  eventProducts,
  events,
  inArray,
  inquiries,
  inventoryTransactions,
  isNull,
  labelPrints,
  like,
  or,
  payments,
  productCategories,
  productImages,
  productMetadataValues,
  products,
  saleItems,
  sales,
  slugRedirects,
  sql,
  categories,
} from "@ffa/db";
import { newId, slugify, validateMetadataValue, type MetadataFieldDef, type ProductStatus } from "@ffa/validators";
import { auditStatement } from "./audit";
import { allocateSkus, sampleProductStatements, type Actor } from "./inventory";
import { listMetadataFields } from "./catalogue";
import { removeImageFile } from "./images";
import type { Db } from "../store";

/**
 * Sample Data Mode (SAMP-1 to SAMP-4). Sample rows are tagged `is_sample`, labelled in the admin, hidden from the public
 * site unless the owner chooses, and removable in one click without touching real data.
 *
 * Cloudflare's free plan allows only 50 database queries per request, so loading and removing work in a handful of
 * reads and one batch rather than going through the per-item services.
 */

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

export type SampleError = { ok: false; code: "CONFLICT" | "INVALID"; message: string };

const DAY = 24 * 3600_000;
const HOUR = 3600_000;

interface SamplePiece {
  title: string;
  art: string;
  status: ProductStatus;
  priceCents: number;
  costCents: number;
  categories: string[];
  description: string;
  alt: string;
  metadata: Record<string, unknown>;
  reservedNote?: string;
  atEvent?: boolean;
}

/** The four pieces SAMP-1 asks for, one in each of the statuses an owner will see. */
export const SAMPLE_PIECES: SamplePiece[] = [
  {
    title: "Blue Morpho Shadowbox",
    art: "blue-morpho",
    status: "AVAILABLE",
    priceCents: 18500,
    costCents: 6000,
    categories: ["butterfly"],
    description: "A sample piece. A morpho butterfly with its wings spread, mounted in a black shadowbox frame. Replace this with your own description.",
    alt: "A sample drawing of a butterfly with its wings spread",
    metadata: { insect_type: "Butterfly", species: "Morpho menelaus", frame_color: "Black", frame_size: "8 x 10 in", provenance: "Farm-raised" },
  },
  {
    title: "Atlas Moth Display",
    art: "atlas-moth",
    status: "RESERVED",
    priceCents: 24000,
    costCents: 9000,
    categories: ["moth"],
    description: "A sample piece. A large atlas moth in a natural wood frame. Shown as reserved so you can see how that looks.",
    alt: "A sample drawing of a large moth",
    metadata: { insect_type: "Moth", species: "Attacus atlas", frame_color: "Natural wood", frame_size: "11 x 14 in", provenance: "Ethically sourced" },
    reservedNote: "Sample: being held for a customer until the weekend.",
  },
  {
    title: "Rainbow Scarab Collection",
    art: "rainbow-scarab",
    status: "AT_EVENT",
    priceCents: 9500,
    costCents: 3000,
    categories: ["beetle", "collection"],
    description: "A sample piece. A small collection of iridescent scarab beetles. Shown as taken to an event.",
    alt: "A sample drawing of a scarab beetle",
    metadata: { insect_type: "Beetle", frame_color: "Walnut", frame_size: "8 x 10 in", provenance: "Antique / vintage" },
    atEvent: true,
  },
  {
    title: "Luna Moth Necklace",
    art: "luna-moth",
    status: "SOLD",
    priceCents: 6500,
    costCents: 1800,
    categories: ["jewelry", "moth"],
    description: "A sample piece. A luna moth wing set in a resin pendant. Shown as sold so you can see how that looks.",
    alt: "A sample drawing of a pale green moth",
    metadata: { insect_type: "Moth", species: "Actias luna", provenance: "Naturally deceased" },
  },
];

interface SampleEvent {
  title: string;
  daysAway: number;
  days: number;
  venue: string;
  description: string;
}

/** SAMP-2. Dates are worked out from today so the events are always in the future. */
export const SAMPLE_EVENTS: SampleEvent[] = [
  { title: "Spring Craft Fair", daysAway: 21, days: 2, venue: "Sample Community Hall", description: "A sample event. Replace it with a real market, or remove the sample data." },
  { title: "Woodland Arts Festival", daysAway: 60, days: 3, venue: "Sample Park Pavilion", description: "A sample event. Replace it with a real market, or remove the sample data." },
  { title: "Holiday Market", daysAway: 120, days: 1, venue: "Sample Town Square", description: "A sample event. Replace it with a real market, or remove the sample data." },
];

export const SAMPLE_PICTURE_KEY = (art: string, productId: string) => `samples/${art}__${productId.slice(-6).toLowerCase()}.svg`;

export interface SampleStatus {
  products: number;
  events: number;
  /** True when anything sample is in the database. */
  loaded: boolean;
}

export async function sampleStatus(db: Db): Promise<SampleStatus> {
  const [p, e] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(products).where(eq(products.isSample, true)).get(),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(eq(events.isSample, true)).get(),
  ]);
  const productCount = p?.n ?? 0;
  const eventCount = e?.n ?? 0;
  return { products: productCount, events: eventCount, loaded: productCount + eventCount > 0 };
}

/** The first free web address, given the ones already taken. */
function freeSlug(base: string, taken: Set<string>): string {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  taken.add(candidate);
  return candidate;
}

export async function loadSampleData(db: Db, actor: Actor, opts: { now?: number; art: Record<string, { svg: string; width: number; height: number }> }): Promise<{ ok: true; products: number; events: number } | SampleError> {
  if ((await sampleStatus(db)).loaded) return { ok: false, code: "CONFLICT", message: "The sample data is already loaded." };
  const now = opts.now ?? Date.now();

  const baseSlugs = [...SAMPLE_PIECES.map((p) => slugify(p.title)), ...SAMPLE_EVENTS.map((e) => slugify(e.title))];
  const [skus, cats, fields, takenProducts, takenEvents] = await Promise.all([
    allocateSkus(db, SAMPLE_PIECES.length),
    db.select({ id: categories.id, slug: categories.slug }).from(categories).where(isNull(categories.archivedAt)).all(),
    listMetadataFields(db),
    db.select({ slug: products.slug }).from(products).where(or(...baseSlugs.map((s) => like(products.slug, `${s}%`)))).all(),
    db.select({ slug: events.slug }).from(events).where(or(...baseSlugs.map((s) => like(events.slug, `${s}%`)))).all(),
  ]);
  const categoryBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const productSlugs = new Set(takenProducts.map((r) => r.slug));
  const eventSlugs = new Set(takenEvents.map((r) => r.slug));

  const eventRows = SAMPLE_EVENTS.map((e) => {
    // Start at 14:00 UTC, which is the morning in Toronto, so the date reads the same for everyone.
    const day = new Date(now + e.daysAway * DAY);
    const startsAt = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 14);
    return {
      id: newId(),
      slug: freeSlug(slugify(e.title), eventSlugs),
      title: e.title,
      description: e.description,
      venue: e.venue,
      address: "Sample address",
      startsAt: new Date(startsAt),
      endsAt: new Date(startsAt + (e.days - 1) * DAY + 8 * HOUR),
      status: "PUBLISHED" as const,
    };
  });
  const firstEvent = eventRows[0]!;

  const statements: Batchable[] = [];
  const pieceIds: string[] = [];
  SAMPLE_PIECES.forEach((piece, i) => {
    const id = newId();
    pieceIds.push(id);
    const quantity = piece.status === "SOLD" ? 0 : 1;
    statements.push(
      ...sampleProductStatements(db, actor, {
        id,
        sku: skus[i]!,
        slug: freeSlug(slugify(piece.title), productSlugs),
        title: piece.title,
        description: piece.description,
        priceCents: piece.priceCents,
        costCents: piece.costCents,
        status: piece.status,
        quantity,
        reservedNote: piece.reservedNote,
      }),
    );
    const art = opts.art[piece.art];
    if (art) {
      statements.push(
        db.insert(productImages).values({
          id: newId(),
          productId: id,
          r2Key: SAMPLE_PICTURE_KEY(piece.art, id),
          altText: piece.alt,
          sortOrder: 0,
          isPrimary: true,
          width: art.width,
          height: art.height,
          contentType: "image/svg+xml",
          byteSize: art.svg.length,
        }),
      );
    }
    const categoryIds = piece.categories.flatMap((slug) => (categoryBySlug.has(slug) ? [categoryBySlug.get(slug)!] : []));
    if (categoryIds.length) statements.push(db.insert(productCategories).values(categoryIds.map((categoryId) => ({ productId: id, categoryId }))));
    for (const [key, input] of Object.entries(piece.metadata)) {
      const field = fieldByKey.get(key);
      if (!field) continue;
      const def: MetadataFieldDef = { key: field.key, label: field.label, type: field.type, options: field.options };
      const checked = validateMetadataValue(def, input);
      // A field the owner has since changed to something else is simply left blank.
      if (checked.ok && checked.value !== null) statements.push(db.insert(productMetadataValues).values({ productId: id, fieldId: field.id, value: checked.value }));
    }
    if (piece.atEvent) statements.push(db.insert(eventProducts).values({ id: newId(), eventId: firstEvent.id, productId: id, previousStatus: "AVAILABLE" }));
  });
  // Events go in first so the link above has something to point at.
  const eventStatements = eventRows.map((e) => db.insert(events).values({ ...e, isSample: true }));

  await runBatch(db, [
    ...eventStatements,
    ...statements,
    auditStatement(db, { userId: actor.id, action: "samples.load", entityType: "sample", diff: { products: pieceIds.length, events: eventRows.length } }),
  ]);
  return { ok: true, products: pieceIds.length, events: eventRows.length };
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

export interface SampleRemoval {
  ok: true;
  removedProducts: number;
  removedEvents: number;
  /** Sales that only held sample pieces (test sales made while trying the app). They go with the samples. */
  removedTestSales: number;
  keptProducts: { sku: string; title: string; reason: string }[];
  keptEvents: { title: string; reason: string }[];
}

const CHUNK = 40;
const chunks = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
};

/**
 * Removes every sample piece and event in one batch, plus the test sales made with only sample pieces. Real data is never
 * touched: a sample piece that is in a sale with a real piece is kept (and reported), and so is a sample event that real
 * pieces or sales still point at. The database triggers from migration 0007 only allow deleting rows of sample pieces.
 */
export async function removeSampleData(db: Db, actor: Actor, bucket?: R2Bucket): Promise<SampleRemoval> {
  const sampleProducts = await db.select({ id: products.id, sku: products.sku, title: products.title }).from(products).where(eq(products.isSample, true)).all();
  const sampleEvents = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.isSample, true)).all();
  const empty: SampleRemoval = { ok: true, removedProducts: 0, removedEvents: 0, removedTestSales: 0, keptProducts: [], keptEvents: [] };
  if (!sampleProducts.length && !sampleEvents.length) return empty;

  // Every sale that holds at least one sample piece, and whether it also holds a real one.
  const saleRows = await db.all<{ saleId: string; number: number; real: number }>(sql`
    SELECT si.sale_id AS saleId, s.number AS number, MAX(CASE WHEN p.is_sample = 0 THEN 1 ELSE 0 END) AS real
    FROM sale_item si
    JOIN product p ON p.id = si.product_id
    JOIN sale s ON s.id = si.sale_id
    WHERE si.sale_id IN (SELECT si2.sale_id FROM sale_item si2 JOIN product p2 ON p2.id = si2.product_id WHERE p2.is_sample = 1)
    GROUP BY si.sale_id, s.number`);
  const testSaleIds = saleRows.filter((r) => !r.real).map((r) => r.saleId);
  const realSaleNumber = new Map(saleRows.filter((r) => r.real).map((r) => [r.saleId, r.number]));

  const inRealSale = realSaleNumber.size
    ? await db.all<{ productId: string; saleId: string }>(sql`
        SELECT si.product_id AS productId, si.sale_id AS saleId FROM sale_item si JOIN product p ON p.id = si.product_id
        WHERE p.is_sample = 1 AND si.sale_id IN (SELECT si2.sale_id FROM sale_item si2 JOIN product p2 ON p2.id = si2.product_id WHERE p2.is_sample = 0)`)
    : [];
  const keptReason = new Map<string, string>();
  for (const r of inRealSale) keptReason.set(r.productId, `it is part of sale #${realSaleNumber.get(r.saleId)}, which also has a real piece`);

  const removable = sampleProducts.filter((p) => !keptReason.has(p.id));
  const removableIds = removable.map((p) => p.id);
  const removableSet = new Set(removableIds);
  const testSaleSet = new Set(testSaleIds);

  // A sample event stays if something that stays still points at it.
  const [saleRefs, linkRefs, ledgerRefs] = sampleEvents.length
    ? await Promise.all([
        db.all<{ eventId: string; saleId: string }>(sql`SELECT event_id AS eventId, id AS saleId FROM sale WHERE event_id IN (SELECT id FROM event WHERE is_sample = 1)`),
        db.all<{ eventId: string; productId: string }>(sql`SELECT DISTINCT event_id AS eventId, product_id AS productId FROM event_product WHERE event_id IN (SELECT id FROM event WHERE is_sample = 1)`),
        db.all<{ eventId: string; productId: string }>(sql`SELECT DISTINCT event_id AS eventId, product_id AS productId FROM inventory_transaction WHERE event_id IN (SELECT id FROM event WHERE is_sample = 1)`),
      ])
    : [[], [], []];
  const eventKeptReason = new Map<string, string>();
  for (const r of saleRefs) if (!testSaleSet.has(r.saleId)) eventKeptReason.set(r.eventId, "a real sale was made there");
  for (const r of [...linkRefs, ...ledgerRefs]) if (!removableSet.has(r.productId)) eventKeptReason.set(r.eventId, "a piece that stays was taken to it");
  const removableEvents = sampleEvents.filter((e) => !eventKeptReason.has(e.id));
  const removableEventIds = removableEvents.map((e) => e.id);

  // Photos the owner uploaded to a sample piece live in storage and need removing there too. The drawings do not.
  const uploaded = removableIds.length
    ? (await Promise.all(chunks(removableIds).map((ids) => db.select({ key: productImages.r2Key }).from(productImages).where(inArray(productImages.productId, ids)).all()))).flat().filter((r) => !r.key.startsWith("samples/"))
    : [];

  const statements: Batchable[] = [];
  for (const ids of chunks(testSaleIds)) statements.push(db.delete(payments).where(inArray(payments.saleId, ids)));
  for (const ids of chunks(removableIds)) {
    statements.push(
      db.delete(inventoryTransactions).where(inArray(inventoryTransactions.productId, ids)),
      db.delete(eventProducts).where(inArray(eventProducts.productId, ids)),
      db.delete(productImages).where(inArray(productImages.productId, ids)),
      db.delete(productCategories).where(inArray(productCategories.productId, ids)),
      db.delete(productMetadataValues).where(inArray(productMetadataValues.productId, ids)),
      db.delete(slugRedirects).where(inArray(slugRedirects.productId, ids)),
      db.delete(labelPrints).where(inArray(labelPrints.productId, ids)),
      db.update(inquiries).set({ productId: null }).where(inArray(inquiries.productId, ids)),
    );
  }
  for (const ids of chunks(testSaleIds)) statements.push(db.delete(saleItems).where(inArray(saleItems.saleId, ids)), db.delete(sales).where(inArray(sales.id, ids)));
  for (const ids of chunks(removableIds)) statements.push(db.delete(products).where(and(inArray(products.id, ids), eq(products.isSample, true))));
  for (const ids of chunks(removableEventIds)) statements.push(db.delete(eventProducts).where(inArray(eventProducts.eventId, ids)), db.delete(events).where(and(inArray(events.id, ids), eq(events.isSample, true))));
  statements.push(
    auditStatement(db, {
      userId: actor.id,
      action: "samples.remove",
      entityType: "sample",
      diff: { products: removableIds.length, events: removableEventIds.length, testSales: testSaleIds.length, keptProducts: keptReason.size, keptEvents: eventKeptReason.size },
    }),
  );
  await runBatch(db, statements);

  if (bucket) for (const r of uploaded) await removeImageFile(bucket, r.key);

  return {
    ok: true,
    removedProducts: removableIds.length,
    removedEvents: removableEventIds.length,
    removedTestSales: testSaleIds.length,
    keptProducts: sampleProducts.filter((p) => keptReason.has(p.id)).map((p) => ({ sku: p.sku, title: p.title, reason: keptReason.get(p.id)! })),
    keptEvents: sampleEvents.filter((e) => eventKeptReason.has(e.id)).map((e) => ({ title: e.title, reason: eventKeptReason.get(e.id)! })),
  };
}
