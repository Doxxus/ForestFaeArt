CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`diff` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE TABLE `content_block` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`image_key` text,
	`is_draft` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_block_key_unique` ON `content_block` (`key`);--> statement-breakpoint
CREATE TABLE `customer` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`email` text,
	`phone` text,
	`notes` text DEFAULT '' NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`marketing_consent_at` integer,
	`marketing_consent_source` text,
	`anonymized_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_email_idx` ON `customer` (`email`);--> statement-breakpoint
CREATE INDEX `customer_name_idx` ON `customer` (`last_name`,`first_name`);--> statement-breakpoint
CREATE TABLE `event_product` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`product_id` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`released_at` integer,
	`previous_status` text,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_product_event_idx` ON `event_product` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_product_product_idx` ON `event_product` (`product_id`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_key` text,
	`website_url` text,
	`venue` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`timezone` text DEFAULT 'America/Toronto' NOT NULL,
	`hours` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	CONSTRAINT "event_status_check" CHECK("event"."status" IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
	CONSTRAINT "event_dates_check" CHECK("event"."ends_at" >= "event"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_slug_unique` ON `event` (`slug`);--> statement-breakpoint
CREATE INDEX `event_starts_idx` ON `event` (`starts_at`);--> statement-breakpoint
CREATE TABLE `import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'APPLIED' NOT NULL,
	`created_at` integer NOT NULL,
	`undone_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "import_batch_status_check" CHECK("import_batch"."status" IN ('APPLIED', 'UNDONE'))
);
--> statement-breakpoint
CREATE TABLE `inquiry` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`email_delivery_status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	`replied_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inquiry_status_check" CHECK("inquiry"."status" IN ('NEW', 'REPLIED', 'ARCHIVED')),
	CONSTRAINT "inquiry_delivery_check" CHECK("inquiry"."email_delivery_status" IN ('PENDING', 'SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX `inquiry_status_idx` ON `inquiry` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `inquiry_reply` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`sent_at` integer NOT NULL,
	`delivery_status` text DEFAULT 'PENDING' NOT NULL,
	`provider_message_id` text,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiry`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inquiry_reply_delivery_check" CHECK("inquiry_reply"."delivery_status" IN ('PENDING', 'SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX `inquiry_reply_inquiry_idx` ON `inquiry_reply` (`inquiry_id`);--> statement-breakpoint
CREATE TABLE `inventory_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`from_status` text,
	`to_status` text NOT NULL,
	`quantity_delta` integer DEFAULT 0 NOT NULL,
	`quantity_after` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`event_id` text,
	`sale_id` text,
	`import_batch_id` text,
	`source` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_tx_source_check" CHECK("inventory_transaction"."source" IN ('ADMIN', 'POS', 'SYSTEM', 'IMPORT')),
	CONSTRAINT "inventory_tx_quantity_check" CHECK("inventory_transaction"."quantity_after" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_tx_product_idx` ON `inventory_transaction` (`product_id`,`at`);--> statement-breakpoint
CREATE INDEX `inventory_tx_sale_idx` ON `inventory_transaction` (`sale_id`);--> statement-breakpoint
CREATE TABLE `label_print` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`format` text NOT NULL,
	`printer` text NOT NULL,
	`title_snapshot` text NOT NULL,
	`price_cents_snapshot` integer NOT NULL,
	`qr_url` text NOT NULL,
	`is_test` integer DEFAULT false NOT NULL,
	`copies` integer DEFAULT 1 NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `label_template`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "label_print_printer_check" CHECK("label_print"."printer" IN ('PDF', 'PNG', 'NIIMBOT_B1', 'A4'))
);
--> statement-breakpoint
CREATE INDEX `label_print_product_idx` ON `label_print` (`product_id`,`at`);--> statement-breakpoint
CREATE TABLE `label_template` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`width_mm` real NOT NULL,
	`height_mm` real NOT NULL,
	`orientation` text DEFAULT 'LANDSCAPE' NOT NULL,
	`margins_mm` text DEFAULT '{}' NOT NULL,
	`fields` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "label_template_orientation_check" CHECK("label_template"."orientation" IN ('LANDSCAPE', 'PORTRAIT')),
	CONSTRAINT "label_template_size_check" CHECK("label_template"."width_mm" > 0 AND "label_template"."height_mm" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `label_template_one_default` ON `label_template` (`is_default`) WHERE "label_template"."is_default" = 1;--> statement-breakpoint
CREATE TABLE `metadata_field` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`help_text` text DEFAULT '' NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`filterable` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "metadata_field_type_check" CHECK("metadata_field"."type" IN ('TEXT', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'YEAR', 'YES_NO'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metadata_field_key_unique` ON `metadata_field` (`key`);--> statement-breakpoint
CREATE TABLE `payment` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`method` text NOT NULL,
	`provider` text DEFAULT 'NONE' NOT NULL,
	`provider_ref` text,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'RECORDED' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_method_check" CHECK("payment"."method" IN ('CASH', 'CARD', 'E_TRANSFER', 'OTHER')),
	CONSTRAINT "payment_provider_check" CHECK("payment"."provider" IN ('NONE', 'SQUARE', 'STRIPE')),
	CONSTRAINT "payment_status_check" CHECK("payment"."status" IN ('RECORDED', 'PENDING', 'FAILED', 'REFUNDED')),
	CONSTRAINT "payment_amount_check" CHECK("payment"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `payment_sale_idx` ON `payment` (`sale_id`);--> statement-breakpoint
CREATE TABLE `product_category` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_category_category_idx` ON `product_category` (`category_id`);--> statement-breakpoint
CREATE TABLE `product_image` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`alt_text` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`width` integer,
	`height` integer,
	`content_type` text,
	`byte_size` integer,
	`blur_data_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_image_product_idx` ON `product_image` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_image_r2_key_unique` ON `product_image` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_image_one_primary` ON `product_image` (`product_id`) WHERE "product_image"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `product_metadata_value` (
	`product_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`product_id`, `field_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`field_id`) REFERENCES `metadata_field`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pmv_field_value_idx` ON `product_metadata_value` (`field_id`,`value`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`cost_cents` integer,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`portfolio_visible` integer DEFAULT true NOT NULL,
	`online_visible` integer DEFAULT false NOT NULL,
	`online_purchasable` integer DEFAULT false NOT NULL,
	`hide_price` integer DEFAULT false NOT NULL,
	`weight_grams` integer,
	`length_mm` integer,
	`width_mm` integer,
	`height_mm` integer,
	`shipping_class` text,
	`tax_category` text,
	`fragile` integer DEFAULT false NOT NULL,
	`reserved_customer_id` text,
	`reserved_note` text,
	`reserved_until` integer,
	`is_sample` integer DEFAULT false NOT NULL,
	`import_batch_id` text,
	`external_id` text,
	`listed_on_etsy` integer DEFAULT false NOT NULL,
	`etsy_url` text,
	`etsy_listing_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`reserved_customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_status_check" CHECK("product"."status" IN ('DRAFT', 'AVAILABLE', 'RESERVED', 'AT_EVENT', 'PENDING_PAYMENT', 'SOLD', 'ARCHIVED')),
	CONSTRAINT "product_quantity_check" CHECK("product"."quantity" >= 0),
	CONSTRAINT "product_price_check" CHECK("product"."price_cents" >= 0),
	CONSTRAINT "product_cost_check" CHECK("product"."cost_cents" IS NULL OR "product"."cost_cents" >= 0),
	CONSTRAINT "product_stock_status_check" CHECK(NOT ("product"."quantity" = 0 AND "product"."status" IN ('AVAILABLE','RESERVED','AT_EVENT','PENDING_PAYMENT'))),
	CONSTRAINT "product_sold_has_no_stock_check" CHECK(NOT ("product"."quantity" > 0 AND "product"."status" = 'SOLD'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_sku_unique` ON `product` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_slug_unique` ON `product` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_external_id_unique` ON `product` (`external_id`);--> statement-breakpoint
CREATE INDEX `product_status_visible_idx` ON `product` (`status`,`portfolio_visible`);--> statement-breakpoint
CREATE INDEX `product_featured_idx` ON `product` (`featured`);--> statement-breakpoint
CREATE INDEX `product_import_batch_idx` ON `product` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_item` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`price_cents_snapshot` integer NOT NULL,
	`title_snapshot` text NOT NULL,
	`sku_snapshot` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_item_quantity_check" CHECK("sale_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `sale_item_sale_idx` ON `sale_item` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_item_product_idx` ON `sale_item` (`product_id`);--> statement-breakpoint
CREATE TABLE `sale` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`channel` text NOT NULL,
	`customer_id` text,
	`event_id` text,
	`sold_by_user_id` text NOT NULL,
	`status` text DEFAULT 'COMPLETED' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`idempotency_key` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sold_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_channel_check" CHECK("sale"."channel" IN ('ONLINE', 'MARKET', 'CUSTOM', 'INSTAGRAM', 'ETSY', 'PHONE')),
	CONSTRAINT "sale_status_check" CHECK("sale"."status" IN ('COMPLETED', 'VOIDED')),
	CONSTRAINT "sale_amounts_check" CHECK("sale"."subtotal_cents" >= 0 AND "sale"."discount_cents" >= 0 AND "sale"."tax_cents" >= 0 AND "sale"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_idempotency_unique` ON `sale` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sale_number_unique` ON `sale` (`number`);--> statement-breakpoint
CREATE INDEX `sale_occurred_idx` ON `sale` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `sale_event_idx` ON `sale` (`event_id`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `slug_redirect` (
	`slug` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
