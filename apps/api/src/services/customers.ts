import { and, asc, customers, desc, eq, isNull, products, sql } from "@ffa/db";
import { newId, csvCell, toCsv, type CustomerFields } from "@ffa/validators";
import { auditStatement } from "./audit";
import type { Db } from "../store";

export type CustomerErrorCode = "NOT_FOUND" | "INVALID" | "CONFLICT";
export type CustomerError = { ok: false; code: CustomerErrorCode; message: string };
const fail = (code: CustomerErrorCode, message: string): CustomerError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];

/** "Sam Rivera", or whatever contact detail there is, so a row is never blank. */
export function customerDisplayName(c: { firstName: string; lastName: string; email?: string | null; phone?: string | null }): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || c.email?.trim() || c.phone?.trim() || "Customer";
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/** The id of an existing customer with this email (any capitalisation), ignoring anonymised ones. */
export async function findCustomerByEmail(db: Db, email: string): Promise<string | null> {
  const row = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(sql`lower(${customers.email}) = ${email.trim().toLowerCase()}`, isNull(customers.anonymizedAt)))
    .get();
  return row?.id ?? null;
}

/** The insert as a query, so it can join a sale's batch and roll back with it. */
export function createCustomerStatement(db: Db, fields: CustomerFields, source: "POS" | "ADMIN"): { id: string; statement: Batchable } {
  const id = newId();
  const consent = fields.marketingConsent;
  return {
    id,
    statement: db.insert(customers).values({
      id,
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      email: clean(fields.email),
      phone: clean(fields.phone),
      notes: fields.notes.trim(),
      marketingConsent: consent,
      marketingConsentAt: consent ? new Date() : null,
      marketingConsentSource: consent ? source : null,
    }),
  };
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  marketingConsent: boolean;
  anonymized: boolean;
  purchases: number;
  spentCents: number;
  lastPurchaseAt: number | null;
}

const stats = {
  purchases: sql<number>`(SELECT COUNT(*) FROM sale s WHERE s.customer_id = customer.id AND s.status = 'COMPLETED')`,
  spentCents: sql<number>`(SELECT COALESCE(SUM(s.total_cents), 0) FROM sale s WHERE s.customer_id = customer.id AND s.status = 'COMPLETED')`,
  lastPurchaseAt: sql<number | null>`(SELECT MAX(s.occurred_at) FROM sale s WHERE s.customer_id = customer.id AND s.status = 'COMPLETED')`,
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function toSummary(r: { c: typeof customers.$inferSelect; purchases: number; spentCents: number; lastPurchaseAt: number | null }): CustomerSummary {
  return {
    id: r.c.id,
    name: r.c.anonymizedAt ? "Anonymised customer" : customerDisplayName(r.c),
    email: r.c.email,
    phone: r.c.phone,
    marketingConsent: r.c.marketingConsent,
    anonymized: Boolean(r.c.anonymizedAt),
    purchases: r.purchases,
    spentCents: r.spentCents,
    lastPurchaseAt: r.lastPurchaseAt,
  };
}

/** Search by name, email or phone (CUS-2). Anonymised customers are left out. */
export async function searchCustomers(db: Db, q: string, opts: { limit?: number; offset?: number; includeAnonymized?: boolean } = {}): Promise<{ rows: CustomerSummary[]; total: number }> {
  const term = q.trim().toLowerCase();
  const like = `%${escapeLike(term)}%`;
  const digits = term.replace(/\D/g, "");
  const where = and(
    opts.includeAnonymized ? undefined : isNull(customers.anonymizedAt),
    term
      ? sql`(lower(customer.first_name || ' ' || customer.last_name) LIKE ${like} ESCAPE '\\' OR lower(COALESCE(customer.email, '')) LIKE ${like} ESCAPE '\\'
          OR replace(replace(replace(replace(COALESCE(customer.phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${digits ? `%${digits}%` : like} ESCAPE '\\')`
      : undefined,
  );
  const [rows, count] = await Promise.all([
    db
      .select({ c: customers, ...stats })
      .from(customers)
      .where(where)
      .orderBy(sql`lower(customer.last_name)`, sql`lower(customer.first_name)`, asc(customers.id))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0)
      .all(),
    db.select({ n: sql<number>`COUNT(*)` }).from(customers).where(where).get(),
  ]);
  return { rows: rows.map(toSummary), total: count?.n ?? 0 };
}

export interface CustomerDetail extends CustomerSummary {
  firstName: string;
  lastName: string;
  notes: string;
  marketingConsentAt: number | null;
  marketingConsentSource: string | null;
  createdAt: number;
  reserved: { id: string; sku: string; title: string; reservedNote: string | null; reservedUntil: number | null }[];
}

export async function getCustomer(db: Db, id: string): Promise<CustomerDetail | null> {
  const row = await db
    .select({ c: customers, ...stats })
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  if (!row) return null;
  const reserved = await db
    .select({ id: products.id, sku: products.sku, title: products.title, reservedNote: products.reservedNote, reservedUntil: products.reservedUntil })
    .from(products)
    .where(and(eq(products.reservedCustomerId, id), eq(products.status, "RESERVED")))
    .orderBy(asc(products.sku))
    .all();
  return {
    ...toSummary(row),
    firstName: row.c.firstName,
    lastName: row.c.lastName,
    notes: row.c.notes,
    marketingConsentAt: row.c.marketingConsentAt?.getTime() ?? null,
    marketingConsentSource: row.c.marketingConsentSource,
    createdAt: row.c.createdAt.getTime(),
    reserved: reserved.map((r) => ({ ...r, reservedUntil: r.reservedUntil?.getTime() ?? null })),
  };
}

export async function createCustomer(db: Db, actorId: string, fields: CustomerFields, source: "POS" | "ADMIN"): Promise<{ ok: true; id: string } | CustomerError> {
  const email = fields.email.trim();
  if (email && (await findCustomerByEmail(db, email))) return fail("CONFLICT", "There is already a customer with that email address.");
  const created = createCustomerStatement(db, fields, source);
  await db.batch([
    created.statement,
    auditStatement(db, { userId: actorId, action: "customer.create", entityType: "customer", entityId: created.id, diff: { source } }),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return { ok: true, id: created.id };
}

export async function updateCustomer(db: Db, actorId: string, id: string, fields: CustomerFields): Promise<{ ok: true } | CustomerError> {
  const before = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!before) return fail("NOT_FOUND", "That customer doesn't exist.");
  if (before.anonymizedAt) return fail("INVALID", "An anonymised customer can't be edited.");
  const email = fields.email.trim();
  if (email && email.toLowerCase() !== (before.email ?? "").toLowerCase()) {
    const taken = await findCustomerByEmail(db, email);
    if (taken && taken !== id) return fail("CONFLICT", "There is already a customer with that email address.");
  }
  const consentChanged = fields.marketingConsent !== before.marketingConsent;
  await db.batch([
    db
      .update(customers)
      .set({
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        email: clean(fields.email),
        phone: clean(fields.phone),
        notes: fields.notes.trim(),
        marketingConsent: fields.marketingConsent,
        ...(consentChanged ? { marketingConsentAt: new Date(), marketingConsentSource: "ADMIN" } : {}),
      })
      .where(eq(customers.id, id)),
    // Contact details are personal data, so the audit log records that they changed but not what they were.
    auditStatement(db, { userId: actorId, action: "customer.update", entityType: "customer", entityId: id, diff: { consentChanged } }),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return { ok: true };
}

/**
 * Removes a customer's personal details on request (CUS-5). Their sales stay, so the books still add up, but they point at
 * an anonymised record. The note on any piece reserved for them is cleared too.
 */
export async function anonymizeCustomer(db: Db, actorId: string, id: string): Promise<{ ok: true } | CustomerError> {
  const before = await db.select({ id: customers.id, anonymizedAt: customers.anonymizedAt }).from(customers).where(eq(customers.id, id)).get();
  if (!before) return fail("NOT_FOUND", "That customer doesn't exist.");
  if (before.anonymizedAt) return fail("CONFLICT", "That customer has already been anonymised.");
  await db.batch([
    db
      .update(customers)
      .set({ firstName: "", lastName: "", email: null, phone: null, notes: "", marketingConsent: false, marketingConsentAt: null, marketingConsentSource: null, anonymizedAt: new Date() })
      .where(eq(customers.id, id)),
    db.update(products).set({ reservedNote: null }).where(eq(products.reservedCustomerId, id)),
    auditStatement(db, { userId: actorId, action: "customer.anonymize", entityType: "customer", entityId: id }),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return { ok: true };
}

/** Everyone except anonymised customers, as CSV (CUS-5). Includes the marketing consent flag with its date and source (CUS-4). */
export async function customersCsv(db: Db): Promise<string> {
  const rows = await db
    .select({ c: customers, purchases: stats.purchases, spentCents: stats.spentCents })
    .from(customers)
    .where(isNull(customers.anonymizedAt))
    .orderBy(desc(customers.createdAt), asc(customers.id))
    .all();
  return toCsv([
    ["First name", "Last name", "Email", "Phone", "Marketing consent", "Consent date", "Consent source", "Purchases", "Total spent", "Notes", "Added"],
    ...rows.map(({ c, purchases, spentCents }) => [
      csvCell(c.firstName),
      csvCell(c.lastName),
      csvCell(c.email ?? ""),
      csvCell(c.phone ?? ""),
      c.marketingConsent ? "Yes" : "No",
      c.marketingConsentAt?.toISOString().slice(0, 10) ?? "",
      c.marketingConsentSource ?? "",
      String(purchases),
      (spentCents / 100).toFixed(2),
      csvCell(c.notes),
      c.createdAt.toISOString().slice(0, 10),
    ]),
  ]);
}
