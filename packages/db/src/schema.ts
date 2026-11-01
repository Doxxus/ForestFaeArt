import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Timestamps are UTC milliseconds. IDs are ULIDs (ADR 001).
const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const users = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["ADMIN", "STAFF"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    passwordHash: text("password_hash"),
    sessionVersion: integer("session_version").notNull().default(0),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
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
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("auth_token_hash_unique").on(t.tokenHash), index("auth_token_user_idx").on(t.userId)],
);

// One row per counter (for example "sku"). Incremented atomically so SKUs are never reused.
export const counters = sqliteTable("counter", {
  key: text("key").primaryKey(),
  nextValue: integer("next_value").notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
