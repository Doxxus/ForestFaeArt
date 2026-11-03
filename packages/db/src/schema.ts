import { sql, type SQL } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import {
  DELIVERY_STATUSES,
  EVENT_STATUSES,
  IMPORT_BATCH_STATUSES,
  INQUIRY_STATUSES,
  LABEL_ORIENTATIONS,
  LABEL_PRINTERS,
  METADATA_FIELD_TYPES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  ROLES,
  SALE_CHANNELS,
  SALE_STATUSES,
  TRANSACTION_SOURCES,
} from "@ffa/validators";

// Timestamps are UTC milliseconds. IDs are ULIDs (ADR 001). Money is integer cents (ADR 001).
// See ADR 006 for the reasoning behind this model.

const ms = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  ms("created_at")
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  ms("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const timestamps = { createdAt: createdAt(), updatedAt: updatedAt() };

/** CHECK that a text column holds one of the allowed values, so a bug cannot write a stray status. */
const oneOf = (column: AnySQLiteColumn, values: readonly string[]): SQL =>
  sql`${column} IN (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`;

const STOCKED_STATUSES = "'AVAILABLE','RESERVED','AT_EVENT','PENDING_PAYMENT'";

// ---------------------------------------------------------------------------
// Users and auth
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    passwordHash: text("password_hash"),
    sessionVersion: integer("session_version").notNull().default(0),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ms("locked_until"),
    ...timestamps,
  },
  (t) => [uniqueIndex("user_email_unique").on(t.email)],
);

export const authTokens = sqliteTable(
  "auth_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["SET_PASSWORD", "RESET"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ms("expires_at").notNull(),
    usedAt: ms("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_token_hash_unique").on(t.tokenHash), index("auth_token_user_idx").on(t.userId)],
);

/** Fixed-window counters for login and form rate limiting (AUTH-8). Old rows are pruned opportunistically. */
export const rateLimits = sqliteTable("rate_limit", {
  key: text("key").primaryKey(),
  windowStart: ms("window_start").notNull(),
  count: integer("count").notNull(),
});

// One row per counter (for example "sku"). Incremented atomically so SKUs are never reused.
export const counters = sqliteTable("counter", {
  key: text("key").primaryKey(),
  nextValue: integer("next_value").notNull(),
});

// ---------------------------------------------------------------------------
// Site settings and content
// ---------------------------------------------------------------------------

/** Typed keys are defined in @ffa/validators (SETTINGS). `value` is JSON text. */
export const settings = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by").references(() => users.id),
});

/** About, legal and other owner-editable pages. `isDraft` stays true until the owner publishes the placeholder copy. */
export const contentBlocks = sqliteTable(
  "content_block",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    imageKey: text("image_key"),
    isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("content_block_key_unique").on(t.key)],
);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const importBatches = sqliteTable(
  "import_batch",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    filename: text("filename").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    status: text("status", { enum: IMPORT_BATCH_STATUSES }).notNull().default("APPLIED"),
    createdAt: createdAt(),
    undoneAt: ms("undone_at"),
  },
  (t) => [check("import_batch_status_check", oneOf(t.status, IMPORT_BATCH_STATUSES))],
);

export const customers = sqliteTable(
  "customer",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes").notNull().default(""),
    marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
    marketingConsentAt: ms("marketing_consent_at"),
    marketingConsentSource: text("marketing_consent_source"),
    /** Set when the customer is anonymised on request (CUS-5). Personal fields are blanked, history is kept. */
    anonymizedAt: ms("anonymized_at"),
    ...timestamps,
  },
  (t) => [index("customer_email_idx").on(t.email), index("customer_name_idx").on(t.lastName, t.firstName)],
);

export const products = sqliteTable(
  "product",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull().default(0),
    /** ADMIN only. Removed from every STAFF and public response. */
    costCents: integer("cost_cents"),
    currency: text("currency").notNull().default("CAD"),
    status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("DRAFT"),
    quantity: integer("quantity").notNull().default(1),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    portfolioVisible: integer("portfolio_visible", { mode: "boolean" }).notNull().default(true),
    onlineVisible: integer("online_visible", { mode: "boolean" }).notNull().default(false),
    onlinePurchasable: integer("online_purchasable", { mode: "boolean" }).notNull().default(false),
    hidePrice: integer("hide_price", { mode: "boolean" }).notNull().default(false),
    // Future commerce fields (PROD-6). Millimetres and grams so nothing is fractional.
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    shippingClass: text("shipping_class"),
    taxCategory: text("tax_category"),
    fragile: integer("fragile", { mode: "boolean" }).notNull().default(false),
    // Reserved-for (INV-9).
    reservedCustomerId: text("reserved_customer_id").references(() => customers.id),
    reservedNote: text("reserved_note"),
    reservedUntil: ms("reserved_until"),
    // Import and Etsy (IMP-4, IMP-6, PROD-8, ETSY-1, ETSY-2).
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    importBatchId: text("import_batch_id").references(() => importBatches.id),
    externalId: text("external_id"),
    listedOnEtsy: integer("listed_on_etsy", { mode: "boolean" }).notNull().default(false),
    etsyUrl: text("etsy_url"),
    etsyListingId: text("etsy_listing_id"),
    ...timestamps,
    archivedAt: ms("archived_at"),
  },
  (t) => [
    uniqueIndex("product_sku_unique").on(t.sku),
    uniqueIndex("product_slug_unique").on(t.slug),
    uniqueIndex("product_external_id_unique").on(t.externalId),
    index("product_status_visible_idx").on(t.status, t.portfolioVisible),
    index("product_featured_idx").on(t.featured),
    index("product_import_batch_idx").on(t.importBatchId),
    check("product_status_check", oneOf(t.status, PRODUCT_STATUSES)),
    check("product_quantity_check", sql`${t.quantity} >= 0`),
    check("product_price_check", sql`${t.priceCents} >= 0`),
    check("product_cost_check", sql`${t.costCents} IS NULL OR ${t.costCents} >= 0`),
    // The database refuses states that break the stock rules (INV-12), even if the service has a bug.
    check("product_stock_status_check", sql`NOT (${t.quantity} = 0 AND ${t.status} IN (${sql.raw(STOCKED_STATUSES)}))`),
    check("product_sold_has_no_stock_check", sql`NOT (${t.quantity} > 0 AND ${t.status} = 'SOLD')`),
  ],
);

/** Old slugs keep working after a title change, because QR codes use the SKU but links get shared (ADR 006). */
export const slugRedirects = sqliteTable("slug_redirect", {
  slug: text("slug").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  createdAt: createdAt(),
});

export const productImages = sqliteTable(
  "product_image",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    r2Key: text("r2_key").notNull(),
    altText: text("alt_text").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    width: integer("width"),
    height: integer("height"),
    contentType: text("content_type"),
    byteSize: integer("byte_size"),
    /** Tiny inline preview for lazy loading (IMG-4). */
    blurDataUrl: text("blur_data_url"),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_image_product_idx").on(t.productId, t.sortOrder),
    uniqueIndex("product_image_r2_key_unique").on(t.r2Key),
    // At most one primary image per product.
    uniqueIndex("product_image_one_primary").on(t.productId).where(sql`${t.isPrimary} = 1`),
  ],
);

export const categories = sqliteTable(
  "category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    imageKey: text("image_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    archivedAt: ms("archived_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("category_slug_unique").on(t.slug)],
);

export const productCategories = sqliteTable(
  "product_category",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] }), index("product_category_category_idx").on(t.categoryId)],
);

/** Owner-defined fields. Removing one archives it so existing values are preserved (META-5). */
export const metadataFields = sqliteTable(
  "metadata_field",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", { enum: METADATA_FIELD_TYPES }).notNull(),
    /** JSON array of choices for SELECT and MULTI_SELECT. */
    options: text("options").notNull().default("[]"),
    helpText: text("help_text").notNull().default(""),
    required: integer("required", { mode: "boolean" }).notNull().default(false),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    filterable: integer("filterable", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: ms("archived_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("metadata_field_key_unique").on(t.key), check("metadata_field_type_check", oneOf(t.type, METADATA_FIELD_TYPES))],
);

/** `value` is text. MULTI_SELECT stores a JSON array, YES_NO stores "true" or "false". */
export const productMetadataValues = sqliteTable(
  "product_metadata_value",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    fieldId: text("field_id")
      .notNull()
      .references(() => metadataFields.id),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.fieldId] }), index("pmv_field_value_idx").on(t.fieldId, t.value)],
);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const events = sqliteTable(
  "event",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    imageKey: text("image_key"),
    websiteUrl: text("website_url"),
    venue: text("venue").notNull().default(""),
    address: text("address").notNull().default(""),
    startsAt: ms("starts_at").notNull(),
    endsAt: ms("ends_at").notNull(),
    timezone: text("timezone").notNull().default("America/Toronto"),
    /** JSON: opening hours per day, for multi-day events (EVT-8). */
    hours: text("hours").notNull().default("[]"),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: EVENT_STATUSES }).notNull().default("DRAFT"),
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
    archivedAt: ms("archived_at"),
  },
  (t) => [
    uniqueIndex("event_slug_unique").on(t.slug),
    index("event_starts_idx").on(t.startsAt),
    check("event_status_check", oneOf(t.status, EVENT_STATUSES)),
    check("event_dates_check", sql`${t.endsAt} >= ${t.startsAt}`),
  ],
);

export const eventProducts = sqliteTable(
  "event_product",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    assignedAt: ms("assigned_at")
      .notNull()
      .$defaultFn(() => new Date()),
    /** Set when the event is wrapped up or the product is unassigned. */
    releasedAt: ms("released_at"),
    /** The status to return an unsold product to (EVT-6). */
    previousStatus: text("previous_status", { enum: PRODUCT_STATUSES }),
  },
  (t) => [index("event_product_event_idx").on(t.eventId), index("event_product_product_idx").on(t.productId)],
);

// ---------------------------------------------------------------------------
// Sales and payments
// ---------------------------------------------------------------------------

export const sales = sqliteTable(
  "sale",
  {
    id: text("id").primaryKey(),
    /** Human-friendly sequence from the `sale` counter. */
    number: integer("number").notNull(),
    channel: text("channel", { enum: SALE_CHANNELS }).notNull(),
    customerId: text("customer_id").references(() => customers.id),
    eventId: text("event_id").references(() => events.id),
    soldByUserId: text("sold_by_user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: SALE_STATUSES }).notNull().default("COMPLETED"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    /** Always 0 while the owner is not GST/HST registered (SALE-5). */
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    notes: text("notes").notNull().default(""),
    /** Generated by the client for each sale so retries from a flaky connection never double-sell. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** When the sale really happened on the device (the POS may sync it later). */
    occurredAt: ms("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sale_idempotency_unique").on(t.idempotencyKey),
    uniqueIndex("sale_number_unique").on(t.number),
    index("sale_occurred_idx").on(t.occurredAt),
    index("sale_event_idx").on(t.eventId),
    check("sale_channel_check", oneOf(t.channel, SALE_CHANNELS)),
    check("sale_status_check", oneOf(t.status, SALE_STATUSES)),
    check("sale_amounts_check", sql`${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.taxCents} >= 0 AND ${t.totalCents} >= 0`),
  ],
);

/** Snapshots the title, SKU and price so later edits never rewrite history. */
export const saleItems = sqliteTable(
  "sale_item",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    priceCentsSnapshot: integer("price_cents_snapshot").notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    skuSnapshot: text("sku_snapshot").notNull(),
  },
  (t) => [
    index("sale_item_sale_idx").on(t.saleId),
    index("sale_item_product_idx").on(t.productId),
    check("sale_item_quantity_check", sql`${t.quantity} > 0`),
  ],
);

/** Provider-agnostic. `provider` is NONE for recorded cash, card and e-transfer. No card data is ever stored (PAY-1). */
export const payments = sqliteTable(
  "payment",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull().default("NONE"),
    providerRef: text("provider_ref"),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("RECORDED"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_sale_idx").on(t.saleId),
    check("payment_method_check", oneOf(t.method, PAYMENT_METHODS)),
    check("payment_provider_check", oneOf(t.provider, PAYMENT_PROVIDERS)),
    check("payment_status_check", oneOf(t.status, PAYMENT_STATUSES)),
    check("payment_amount_check", sql`${t.amountCents} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Inventory ledger
// ---------------------------------------------------------------------------

/** Append-only (INV-5). Database triggers refuse UPDATE and DELETE. */
export const inventoryTransactions = sqliteTable(
  "inventory_transaction",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    at: ms("at")
      .notNull()
      .$defaultFn(() => new Date()),
    userId: text("user_id").references(() => users.id),
    /** Null for the transaction that creates the product. */
    fromStatus: text("from_status", { enum: PRODUCT_STATUSES }),
    toStatus: text("to_status", { enum: PRODUCT_STATUSES }).notNull(),
    quantityDelta: integer("quantity_delta").notNull().default(0),
    quantityAfter: integer("quantity_after").notNull(),
    notes: text("notes").notNull().default(""),
    eventId: text("event_id").references(() => events.id),
    saleId: text("sale_id").references(() => sales.id),
    importBatchId: text("import_batch_id").references(() => importBatches.id),
    source: text("source", { enum: TRANSACTION_SOURCES }).notNull(),
  },
  (t) => [
    index("inventory_tx_product_idx").on(t.productId, t.at),
    index("inventory_tx_sale_idx").on(t.saleId),
    check("inventory_tx_source_check", oneOf(t.source, TRANSACTION_SOURCES)),
    check("inventory_tx_quantity_check", sql`${t.quantityAfter} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------

export const inquiries = sqliteTable(
  "inquiry",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").references(() => products.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: INQUIRY_STATUSES }).notNull().default("NEW"),
    /** Whether the notification to the inbox was sent. The inquiry itself is always saved first. */
    emailDeliveryStatus: text("email_delivery_status", { enum: DELIVERY_STATUSES }).notNull().default("PENDING"),
    createdAt: createdAt(),
    repliedAt: ms("replied_at"),
  },
  (t) => [
    index("inquiry_status_idx").on(t.status, t.createdAt),
    check("inquiry_status_check", oneOf(t.status, INQUIRY_STATUSES)),
    check("inquiry_delivery_check", oneOf(t.emailDeliveryStatus, DELIVERY_STATUSES)),
  ],
);

export const inquiryReplies = sqliteTable(
  "inquiry_reply",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    sentAt: ms("sent_at")
      .notNull()
      .$defaultFn(() => new Date()),
    deliveryStatus: text("delivery_status", { enum: DELIVERY_STATUSES }).notNull().default("PENDING"),
    providerMessageId: text("provider_message_id"),
  },
  (t) => [index("inquiry_reply_inquiry_idx").on(t.inquiryId), check("inquiry_reply_delivery_check", oneOf(t.deliveryStatus, DELIVERY_STATUSES))],
);

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const labelTemplates = sqliteTable(
  "label_template",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    widthMm: real("width_mm").notNull(),
    heightMm: real("height_mm").notNull(),
    orientation: text("orientation", { enum: LABEL_ORIENTATIONS }).notNull().default("LANDSCAPE"),
    /** JSON: margins in mm. */
    marginsMm: text("margins_mm").notNull().default("{}"),
    /** JSON: which fields appear and where. The shape is owned by @ffa/label-engine. */
    fields: text("fields").notNull().default("{}"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("label_template_one_default").on(t.isDefault).where(sql`${t.isDefault} = 1`),
    check("label_template_orientation_check", oneOf(t.orientation, LABEL_ORIENTATIONS)),
    check("label_template_size_check", sql`${t.widthMm} > 0 AND ${t.heightMm} > 0`),
  ],
);

/** What was printed and when. Titles and prices are snapshotted so changes can flag stale labels (LBL-6). */
export const labelPrints = sqliteTable(
  "label_print",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    templateId: text("template_id").references(() => labelTemplates.id),
    format: text("format").notNull(),
    printer: text("printer", { enum: LABEL_PRINTERS }).notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    priceCentsSnapshot: integer("price_cents_snapshot").notNull(),
    qrUrl: text("qr_url").notNull(),
    isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
    copies: integer("copies").notNull().default(1),
    at: ms("at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("label_print_product_idx").on(t.productId, t.at), check("label_print_printer_check", oneOf(t.printer, LABEL_PRINTERS))],
);

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Append-only. `diff` is JSON of changed fields and never contains secrets. Cost fields are ADMIN-visible only. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: ms("at")
      .notNull()
      .$defaultFn(() => new Date()),
    /** Null when there is no signed-in user (for example a failed sign-in). */
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    diff: text("diff"),
    ip: text("ip"),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_at_idx").on(t.at), index("audit_user_idx").on(t.userId, t.at)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type InventoryTransactionRow = typeof inventoryTransactions.$inferSelect;
