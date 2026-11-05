ALTER TABLE `sale` ADD `discount_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sale` ADD `voided_at` integer;--> statement-breakpoint
ALTER TABLE `sale` ADD `voided_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `sale` ADD `void_reason` text;