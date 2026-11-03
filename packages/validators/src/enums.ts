// Shared value sets. The database enums, API inputs and apps all use these so they cannot drift apart.

export const ROLES = ["ADMIN", "STAFF"] as const;
export type UserRole = (typeof ROLES)[number];

export const PRODUCT_STATUSES = [
  "DRAFT",
  "AVAILABLE",
  "RESERVED",
  "AT_EVENT",
  "PENDING_PAYMENT",
  "SOLD",
  "ARCHIVED",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Where an inventory transaction came from (INV-5). */
export const TRANSACTION_SOURCES = ["ADMIN", "POS", "SYSTEM", "IMPORT"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const STORE_MODES = ["SHOWCASE_ONLY", "ONLINE_STORE", "EVENT_ONLY"] as const;
export type StoreMode = (typeof STORE_MODES)[number];

export const SALE_CHANNELS = ["ONLINE", "MARKET", "CUSTOM", "INSTAGRAM", "ETSY", "PHONE"] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];

export const SALE_STATUSES = ["COMPLETED", "VOIDED"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

/** Recorded only. No card data is ever stored (PAY-1). */
export const PAYMENT_METHODS = ["CASH", "CARD", "E_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = ["NONE", "SQUARE", "STRIPE"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ["RECORDED", "PENDING", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const INQUIRY_STATUSES = ["NEW", "REPLIED", "ARCHIVED"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const METADATA_FIELD_TYPES = ["TEXT", "NUMBER", "SELECT", "MULTI_SELECT", "YEAR", "YES_NO"] as const;
export type MetadataFieldType = (typeof METADATA_FIELD_TYPES)[number];

export const LABEL_ORIENTATIONS = ["LANDSCAPE", "PORTRAIT"] as const;
export type LabelOrientation = (typeof LABEL_ORIENTATIONS)[number];

export const LABEL_PRINTERS = ["PDF", "PNG", "NIIMBOT_B1", "A4"] as const;
export type LabelPrinterKind = (typeof LABEL_PRINTERS)[number];

export const IMPORT_BATCH_STATUSES = ["APPLIED", "UNDONE"] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
