import type { ProductRow } from "@ffa/db";
import type { UserRole } from "@ffa/validators";
import type { Settings } from "@ffa/validators";

/** What STAFF may see: everything except cost (AUTH-4). Removed from the response itself, not hidden in the UI. */
export type StaffProduct = Omit<ProductRow, "costCents">;

export function projectProduct(row: ProductRow, role: UserRole): ProductRow | StaffProduct {
  if (role === "ADMIN") return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "costCents")) as StaffProduct;
}

export type PublicStatus = "AVAILABLE" | "RESERVED" | "SOLD";

/** The only product fields the public API can return. Built as a whitelist so new columns are private by default. */
export interface PublicProduct {
  sku: string;
  slug: string;
  title: string;
  description: string;
  status: PublicStatus;
  featured: boolean;
  priceCents: number | null;
  currency: string;
  /** Only when the owner enables "Only N left". */
  remaining: number | null;
  etsyUrl: string | null;
}

const PUBLIC_STATUS: Record<ProductRow["status"], PublicStatus | null> = {
  DRAFT: null,
  ARCHIVED: null,
  AVAILABLE: "AVAILABLE",
  AT_EVENT: "AVAILABLE",
  // The public never learns that a payment is pending.
  PENDING_PAYMENT: "AVAILABLE",
  RESERVED: "RESERVED",
  SOLD: "SOLD",
};

/** Null when the product must not appear on the public site. Visibility is independent of status (INV-4). */
export function toPublicProduct(
  row: ProductRow,
  settings: Pick<Settings, "showPrices" | "showProductsWithoutPhotos" | "showStockCounts" | "showEtsyLinks">,
  hasPhoto: boolean,
): PublicProduct | null {
  const status = PUBLIC_STATUS[row.status];
  if (!status || !row.portfolioVisible) return null;
  if (!hasPhoto && !settings.showProductsWithoutPhotos) return null;
  return {
    sku: row.sku,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status,
    featured: row.featured,
    priceCents: settings.showPrices && !row.hidePrice ? row.priceCents : null,
    currency: row.currency,
    remaining: settings.showStockCounts && status === "AVAILABLE" ? row.quantity : null,
    etsyUrl: settings.showEtsyLinks && row.listedOnEtsy ? row.etsyUrl : null,
  };
}
