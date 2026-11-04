import { and, asc, categories, eq, inArray, isNull, metadataFields, productCategories, productImages, productMetadataValues, products, sql } from "@ffa/db";
import { PORTFOLIO_SORTS, decodeMetadataValue, type MetadataFieldType, type PortfolioSort, type Settings } from "@ffa/validators";
import type { Db } from "../store";
import { mediaPath } from "./images";
import { toPublicProduct, type PublicProduct } from "./projections";

/** Draft and archived items never leave the database through the public catalogue. */
export const LISTABLE = ["AVAILABLE", "AT_EVENT", "PENDING_PAYMENT", "RESERVED", "SOLD"] as const;
// Written as plain SQL because drizzle drops the table prefix in single-table selects, which would bind to product_image.id.
export const hasPhoto = sql<number>`EXISTS (SELECT 1 FROM product_image pi WHERE pi.product_id = product.id)`;

/** A safety stop. The catalogue is filtered in code, so it must stay small (ADR 011). */
const MAX_PIECES = 2000;

export const SORTS = PORTFOLIO_SORTS;
export type Sort = PortfolioSort;

export interface PublicImage {
  path: string;
  altText: string;
  width: number | null;
  height: number | null;
}

/** Everything a card needs, and nothing else. */
export interface PublicCard extends Omit<PublicProduct, "description"> {
  excerpt: string;
  image: PublicImage | null;
  categories: { name: string; slug: string }[];
}

interface Entry {
  card: PublicCard;
  createdAt: number;
  updatedAt: number;
  categorySlugs: Set<string>;
  /** Filterable public fields only: field key to the values this piece has. */
  fields: Map<string, string[]>;
  searchText: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: MetadataFieldType;
  filterable: boolean;
  sortOrder: number;
}

export interface Portfolio {
  entries: Entry[];
  categories: { name: string; slug: string; description: string; sortOrder: number }[];
  fields: FieldDef[];
}

/** First sentence-ish chunk of the description, for cards. */
export function excerptOf(description: string, max = 160): string {
  const text = description.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max).replace(/[.,;:\s]+$/, "")}…`;
}

/** What a stored field value looks like to a visitor, as one or more plain strings. */
export function displayValues(type: MetadataFieldType, stored: string): string[] {
  const value = decodeMetadataValue(type, stored);
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "boolean") return [value ? "Yes" : "No"];
  const s = String(value).trim();
  return s ? [s] : [];
}

/** Loads every piece the public may see, with the little they need. The one place that applies the public rules (WEB-14). */
export async function loadPortfolio(db: Db, settings: Settings): Promise<Portfolio> {
  const rows = await db
    .select({ product: products, hasPhoto })
    .from(products)
    .where(and(inArray(products.status, [...LISTABLE]), eq(products.portfolioVisible, true)))
    .limit(MAX_PIECES)
    .all();

  const visible = rows.flatMap((r) => {
    const product = toPublicProduct(r.product, settings, Boolean(r.hasPhoto));
    return product ? [{ id: r.product.id, product, row: r.product }] : [];
  });
  const ids = new Set(visible.map((v) => v.id));

  const [images, cats, values] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.isPrimary, true)).all(),
    db
      .select({
        productId: productCategories.productId,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        sortOrder: categories.sortOrder,
      })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(and(eq(categories.hidden, false), isNull(categories.archivedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all(),
    db
      .select({
        productId: productMetadataValues.productId,
        key: metadataFields.key,
        label: metadataFields.label,
        type: metadataFields.type,
        filterable: metadataFields.filterable,
        sortOrder: metadataFields.sortOrder,
        value: productMetadataValues.value,
      })
      .from(productMetadataValues)
      .innerJoin(metadataFields, eq(metadataFields.id, productMetadataValues.fieldId))
      .where(and(eq(metadataFields.isPublic, true), isNull(metadataFields.archivedAt)))
      .all(),
  ]);

  const imageOf = new Map(images.map((i) => [i.productId, { path: mediaPath(i.r2Key), altText: i.altText, width: i.width, height: i.height } satisfies PublicImage]));
  const catsOf = new Map<string, { name: string; slug: string }[]>();
  const categoryList = new Map<string, Portfolio["categories"][number]>();
  for (const c of cats) {
    if (!ids.has(c.productId)) continue;
    catsOf.set(c.productId, [...(catsOf.get(c.productId) ?? []), { name: c.name, slug: c.slug }]);
    categoryList.set(c.slug, { name: c.name, slug: c.slug, description: c.description, sortOrder: c.sortOrder });
  }
  const valuesOf = new Map<string, string[]>();
  const fieldsOf = new Map<string, Map<string, string[]>>();
  const fieldDefs = new Map<string, FieldDef>();
  for (const v of values) {
    if (!ids.has(v.productId)) continue;
    const shown = displayValues(v.type, v.value);
    if (!shown.length) continue;
    valuesOf.set(v.productId, [...(valuesOf.get(v.productId) ?? []), ...shown]);
    fieldDefs.set(v.key, { key: v.key, label: v.label, type: v.type, filterable: v.filterable, sortOrder: v.sortOrder });
    if (v.filterable) {
      const own = fieldsOf.get(v.productId) ?? new Map<string, string[]>();
      own.set(v.key, shown);
      fieldsOf.set(v.productId, own);
    }
  }

  const entries: Entry[] = visible.map(({ id, product, row }) => {
    const categoriesOfPiece = catsOf.get(id) ?? [];
    const { description, ...rest } = product;
    return {
      card: { ...rest, excerpt: excerptOf(description), image: imageOf.get(id) ?? null, categories: categoriesOfPiece },
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      categorySlugs: new Set(categoriesOfPiece.map((c) => c.slug)),
      fields: fieldsOf.get(id) ?? new Map(),
      searchText: [product.title, product.sku, description, ...categoriesOfPiece.map((c) => c.name), ...(valuesOf.get(id) ?? [])].join(" ").toLowerCase(),
    };
  });

  return {
    entries,
    categories: [...categoryList.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    fields: [...fieldDefs.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
  };
}

export interface PortfolioQuery {
  q?: string;
  category?: string;
  show?: "all" | "available";
  filters?: Record<string, string>;
  sort?: Sort;
  page?: number;
  pageSize?: number;
}

type Skip = { category?: boolean; field?: string };

function matches(e: Entry, q: PortfolioQuery, skip: Skip = {}): boolean {
  if (q.show === "available" && e.card.status !== "AVAILABLE") return false;
  if (q.q) {
    const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => e.searchText.includes(w))) return false;
  }
  if (q.category && !skip.category && !e.categorySlugs.has(q.category)) return false;
  for (const [key, wanted] of Object.entries(q.filters ?? {})) {
    if (!wanted || skip.field === key) continue;
    if (!(e.fields.get(key) ?? []).includes(wanted)) return false;
  }
  return true;
}

function compare(sort: Sort): (a: Entry, b: Entry) => number {
  const newest = (a: Entry, b: Entry) => b.createdAt - a.createdAt || (a.card.sku < b.card.sku ? 1 : -1);
  switch (sort) {
    case "featured":
      return (a, b) => Number(b.card.featured) - Number(a.card.featured) || newest(a, b);
    case "title":
      return (a, b) => a.card.title.localeCompare(b.card.title, "en", { sensitivity: "base" }) || newest(a, b);
    case "price-asc":
    case "price-desc": {
      const dir = sort === "price-asc" ? 1 : -1;
      // Pieces with no public price always come last, so ordering never hints at a hidden price.
      return (a, b) => {
        const pa = a.card.priceCents;
        const pb = b.card.priceCents;
        if (pa === null && pb === null) return newest(a, b);
        if (pa === null) return 1;
        if (pb === null) return -1;
        return (pa - pb) * dir || newest(a, b);
      };
    }
    default:
      return newest;
  }
}

export interface PortfolioFacets {
  categories: { name: string; slug: string; description: string; count: number }[];
  fields: { key: string; label: string; options: { value: string; count: number }[] }[];
}

export interface PortfolioResult {
  items: PublicCard[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  /** The sort that was actually used. Price sorting is unavailable while prices are hidden. */
  sort: Sort;
  facets: PortfolioFacets;
}

export function searchPortfolio(portfolio: Portfolio, settings: Pick<Settings, "showPrices">, q: PortfolioQuery): PortfolioResult {
  const pageSize = Math.min(Math.max(q.pageSize ?? 12, 1), 48);
  let sort: Sort = q.sort ?? "newest";
  if (!settings.showPrices && (sort === "price-asc" || sort === "price-desc")) sort = "newest";

  const matched = portfolio.entries.filter((e) => matches(e, q)).sort(compare(sort));
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(q.page ?? 1, 1), pages);

  // Each facet counts pieces that match everything except its own choice, so a choice never shows "0" for itself.
  const forCategories = portfolio.entries.filter((e) => matches(e, q, { category: true }));
  const categoryFacet = portfolio.categories
    .map((c) => ({ name: c.name, slug: c.slug, description: c.description, count: forCategories.filter((e) => e.categorySlugs.has(c.slug)).length }))
    .filter((c) => c.count > 0 || c.slug === q.category);

  const fieldFacets = portfolio.fields
    .filter((f) => f.filterable)
    .map((f) => {
      const counts = new Map<string, number>();
      for (const e of portfolio.entries.filter((e) => matches(e, q, { field: f.key }))) {
        for (const v of new Set(e.fields.get(f.key) ?? [])) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const options = [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      return { key: f.key, label: f.label, options };
    })
    .filter((f) => f.options.length > 0);

  return {
    items: matched.slice((page - 1) * pageSize, page * pageSize).map((e) => e.card),
    total: matched.length,
    page,
    pages,
    pageSize,
    sort,
    facets: { categories: categoryFacet, fields: fieldFacets },
  };
}

/** Pieces that share a category, then featured, then newest. Never includes the piece itself. */
export function relatedPieces(portfolio: Portfolio, sku: string, limit = 4): PublicCard[] {
  const self = portfolio.entries.find((e) => e.card.sku === sku);
  const mine = self?.categorySlugs ?? new Set<string>();
  const shared = (e: Entry) => [...e.categorySlugs].filter((s) => mine.has(s)).length;
  return portfolio.entries
    .filter((e) => e.card.sku !== sku)
    .sort((a, b) => shared(b) - shared(a) || Number(a.card.status === "SOLD") - Number(b.card.status === "SOLD") || Number(b.card.featured) - Number(a.card.featured) || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((e) => e.card);
}

/** Slugs and last-changed times for sitemap.xml. */
export const sitemapPieces = (portfolio: Portfolio) => portfolio.entries.map((e) => ({ slug: e.card.slug, updatedAt: e.updatedAt }));
