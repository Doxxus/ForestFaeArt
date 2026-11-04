import { and, asc, desc, eq, inArray, not, products, sql, type ProductRow } from "@ffa/db";
import type { LabelState, ProductStatus } from "@ffa/validators";
import type { Db } from "../store";
import { labelStateSql } from "./labels";

export const PRODUCT_SORTS = ["newest", "oldest", "title", "price_high", "price_low", "sku"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductFilters {
  /** Matches title, SKU or Etsy-style tags in the title. */
  q?: string;
  status?: ProductStatus[];
  categoryId?: string;
  listedOnEtsy?: boolean;
  hasPhoto?: boolean;
  portfolioVisible?: boolean;
  /** ARCHIVED items are left out unless asked for by status. */
  includeArchived?: boolean;
  /** Only pieces whose label is in this state (LBL-12). Counted against test or real prints per `labelIsTest`. */
  labelState?: LabelState;
  /** Whether labels are being made as tests right now (staging and local), which decides which prints count. */
  labelIsTest?: boolean;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

// Plain SQL with explicit table names: drizzle drops the table prefix in single-table selects.
const imageCount = sql<number>`(SELECT COUNT(*) FROM product_image pi WHERE pi.product_id = product.id)`;
const thumbKey = sql<string | null>`(SELECT pi.r2_key FROM product_image pi WHERE pi.product_id = product.id AND pi.is_primary = 1)`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function where(f: ProductFilters) {
  const q = f.q?.trim();
  return and(
    q ? sql`(lower(product.title) LIKE ${`%${escapeLike(q.toLowerCase())}%`} ESCAPE '\\' OR product.sku LIKE ${`%${escapeLike(q.toUpperCase())}%`} ESCAPE '\\')` : undefined,
    f.status?.length ? inArray(products.status, f.status) : f.includeArchived ? undefined : not(eq(products.status, "ARCHIVED")),
    f.categoryId ? sql`EXISTS (SELECT 1 FROM product_category pc WHERE pc.product_id = product.id AND pc.category_id = ${f.categoryId})` : undefined,
    f.listedOnEtsy === undefined ? undefined : eq(products.listedOnEtsy, f.listedOnEtsy),
    f.portfolioVisible === undefined ? undefined : eq(products.portfolioVisible, f.portfolioVisible),
    f.hasPhoto === undefined ? undefined : f.hasPhoto ? sql`${imageCount} > 0` : sql`${imageCount} = 0`,
    f.labelState ? sql`${labelStateSql(f.labelIsTest ?? true)} = ${f.labelState}` : undefined,
  );
}

const ORDER = {
  newest: [desc(products.id)],
  oldest: [asc(products.id)],
  title: [sql`lower(product.title)`, asc(products.id)],
  price_high: [desc(products.priceCents), desc(products.id)],
  price_low: [asc(products.priceCents), desc(products.id)],
  sku: [asc(products.sku)],
} as const;

export interface ProductListRow {
  product: ProductRow;
  imageCount: number;
  thumbnailKey: string | null;
  labelState: LabelState;
}

export async function listProducts(db: Db, f: ProductFilters): Promise<{ rows: ProductListRow[]; total: number }> {
  const condition = where(f);
  const [rows, count] = await Promise.all([
    db
      .select({ product: products, imageCount, thumbnailKey: thumbKey, labelState: labelStateSql(f.labelIsTest ?? true) })
      .from(products)
      .where(condition)
      .orderBy(...ORDER[f.sort ?? "newest"])
      .limit(f.limit ?? 50)
      .offset(f.offset ?? 0)
      .all(),
    db.select({ n: sql<number>`COUNT(*)` }).from(products).where(condition).get(),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export interface InventorySummary {
  /** Pieces by status (not units). */
  byStatus: Record<ProductStatus, number>;
  needsPhotos: number;
  /** Listed on Etsy and already SOLD here, so the Etsy listing needs removing (ETSY-1). */
  etsySoldToRemove: number;
}

export async function inventorySummary(db: Db): Promise<InventorySummary> {
  const [byStatus, extra] = await Promise.all([
    db.select({ status: products.status, n: sql<number>`COUNT(*)` }).from(products).groupBy(products.status).all(),
    db
      .select({
        needsPhotos: sql<number>`COALESCE(SUM(CASE WHEN product.status != 'ARCHIVED' AND ${imageCount} = 0 THEN 1 ELSE 0 END), 0)`,
        etsySoldToRemove: sql<number>`COALESCE(SUM(CASE WHEN product.listed_on_etsy = 1 AND product.status = 'SOLD' THEN 1 ELSE 0 END), 0)`,
      })
      .from(products)
      .get(),
  ]);
  const counts: Record<ProductStatus, number> = { DRAFT: 0, AVAILABLE: 0, RESERVED: 0, AT_EVENT: 0, PENDING_PAYMENT: 0, SOLD: 0, ARCHIVED: 0 };
  for (const row of byStatus) counts[row.status] = row.n;
  return { byStatus: counts, needsPhotos: extra?.needsPhotos ?? 0, etsySoldToRemove: extra?.etsySoldToRemove ?? 0 };
}

export interface InventoryValue {
  /** Selling price times units for pieces that are in stock. */
  totalValueCents: number;
  /** Cost times units where a cost is known. */
  totalCostCents: number;
}

/** ADMIN only (INV-8, AUTH-4). Never call this for STAFF. */
export async function inventoryValue(db: Db): Promise<InventoryValue> {
  const row = await db
    .select({
      value: sql<number>`COALESCE(SUM(product.price_cents * product.quantity), 0)`,
      cost: sql<number>`COALESCE(SUM(COALESCE(product.cost_cents, 0) * product.quantity), 0)`,
    })
    .from(products)
    .where(inArray(products.status, ["AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"]))
    .get();
  return { totalValueCents: row?.value ?? 0, totalCostCents: row?.cost ?? 0 };
}
