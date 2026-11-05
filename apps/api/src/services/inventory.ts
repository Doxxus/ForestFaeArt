import { eq, and, gte, inArray, inventoryTransactions, products, sql } from "@ffa/db";
import {
  SELLABLE_STATUSES,
  checkTransition,
  formatSku,
  newId,
  slugify,
  statusAfterStockChange,
  uniqueSlug,
  type ProductStatus,
  type TransactionSource,
  type UserRole,
} from "@ffa/validators";
import { auditStatement } from "./audit";
import type { Db } from "../store";

/**
 * The only writer of `product.quantity` and `product.status` (ADR 006).
 *
 * D1 has no interactive transactions, so every change is a guarded UPDATE followed by a ledger INSERT in one
 * db.batch() (which D1 runs atomically). The ledger row's NOT NULL columns are computed with `changes()`, which is
 * 0 when the guard did not match. That makes the INSERT fail, and the whole batch (including any other lines of the
 * same sale) rolls back. No other code path may write these two columns.
 */

export interface Actor {
  /** Null for the system or an import with no signed-in user. */
  id: string | null;
  role: UserRole;
  source: TransactionSource;
}

export type InventoryErrorCode =
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "FORBIDDEN"
  | "REASON_REQUIRED"
  | "INVALID_QUANTITY"
  | "INSUFFICIENT_STOCK"
  | "NOT_SELLABLE"
  | "CONFLICT";

export interface InventoryError {
  ok: false;
  code: InventoryErrorCode;
  message: string;
}

const fail = (code: InventoryErrorCode, message: string): InventoryError => ({ ok: false, code, message });

const CONFLICT_MESSAGE = "Someone else just changed this item. Please refresh and try again.";

type Batchable = Parameters<Db["batch"]>[0][number];

/** Runs the statements as one atomic batch. A failed guard becomes CONFLICT. Any other error is rethrown. */
export async function runGuarded(db: Db, statements: Batchable[]): Promise<InventoryError | null> {
  try {
    await db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
    return null;
  } catch (error) {
    if (isGuardFailure(error)) return fail("CONFLICT", CONFLICT_MESSAGE);
    throw error;
  }
}

function isGuardFailure(error: unknown): boolean {
  const text = [error instanceof Error ? error.message : String(error), error instanceof Error ? String(error.cause ?? "") : ""].join(" ");
  return /NOT NULL constraint failed: inventory_transaction\.(to_status|quantity_after)/i.test(text);
}

interface Snapshot {
  id: string;
  status: ProductStatus;
  quantity: number;
}

async function loadSnapshot(db: Db, id: string): Promise<Snapshot | null> {
  const row = await db
    .select({ id: products.id, status: products.status, quantity: products.quantity })
    .from(products)
    .where(eq(products.id, id))
    .get();
  return row ?? null;
}

const STOCKED: readonly ProductStatus[] = ["AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"];

/** The ledger row for a change that was just applied by the preceding UPDATE. Fails (rolling back) if that UPDATE matched nothing. */
function ledgerAfterUpdate(
  db: Db,
  input: {
    productId: string;
    fromStatus: ProductStatus;
    delta: number;
    actor: Actor;
    notes: string;
    eventId?: string | null;
    saleId?: string | null;
    importBatchId?: string | null;
  },
) {
  return db.insert(inventoryTransactions).values({
    id: newId(),
    productId: input.productId,
    userId: input.actor.id,
    fromStatus: input.fromStatus,
    toStatus: sql`CASE WHEN changes() = 1 THEN (SELECT status FROM product WHERE id = ${input.productId}) END`,
    quantityDelta: input.delta,
    quantityAfter: sql`CASE WHEN changes() = 1 THEN (SELECT quantity FROM product WHERE id = ${input.productId}) END`,
    notes: input.notes,
    eventId: input.eventId ?? null,
    saleId: input.saleId ?? null,
    importBatchId: input.importBatchId ?? null,
    source: input.actor.source,
  });
}

// ---------------------------------------------------------------------------
// SKU
// ---------------------------------------------------------------------------

/** Takes the next SKU number. Numbers are never reused, even if the product insert later fails. */
export async function allocateSku(db: Db): Promise<string> {
  const rows = await db.all<{ n: number }>(
    sql`UPDATE counter SET next_value = next_value + 1 WHERE key = 'sku' RETURNING next_value - 1 AS n`,
  );
  const n = rows[0]?.n;
  if (n === undefined) throw new Error("The sku counter is missing. Run the database migrations.");
  return formatSku(n);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateProductInput {
  title: string;
  description?: string;
  priceCents?: number;
  costCents?: number | null;
  quantity?: number;
  /** New products are DRAFT unless an import says otherwise (PROD-5). */
  status?: ProductStatus;
  externalId?: string | null;
  importBatchId?: string | null;
  listedOnEtsy?: boolean;
  etsyUrl?: string | null;
  isSample?: boolean;
  notes?: string;
}

export async function createProduct(
  db: Db,
  actor: Actor,
  input: CreateProductInput,
): Promise<{ ok: true; id: string; sku: string; slug: string } | InventoryError> {
  const quantity = input.quantity ?? 1;
  const status = input.status ?? "DRAFT";
  if (!Number.isInteger(quantity) || quantity < 0) return fail("INVALID_QUANTITY", "Quantity must be a whole number, 0 or more.");
  if (STOCKED.includes(status) && quantity === 0) return fail("INVALID_QUANTITY", "An item that is offered for sale needs a quantity of at least 1.");
  if (status === "SOLD" && quantity !== 0) return fail("INVALID_QUANTITY", "A sold item has a quantity of 0.");

  const sku = await allocateSku(db);
  const slug = await uniqueSlug(slugify(input.title), async (candidate) => {
    const hit = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).get();
    return Boolean(hit);
  });
  const id = newId();

  await db.batch([
    db.insert(products).values({
      id,
      sku,
      slug,
      title: input.title.trim(),
      description: input.description ?? "",
      priceCents: input.priceCents ?? 0,
      costCents: input.costCents ?? null,
      status,
      quantity,
      externalId: input.externalId ?? null,
      importBatchId: input.importBatchId ?? null,
      listedOnEtsy: input.listedOnEtsy ?? false,
      etsyUrl: input.etsyUrl ?? null,
      isSample: input.isSample ?? false,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    }),
    db.insert(inventoryTransactions).values({
      id: newId(),
      productId: id,
      userId: actor.id,
      fromStatus: null,
      toStatus: status,
      quantityDelta: quantity,
      quantityAfter: quantity,
      notes: input.notes ?? "Created",
      importBatchId: input.importBatchId ?? null,
      source: actor.source,
    }),
    auditStatement(db, {
      userId: actor.id,
      action: "product.create",
      entityType: "product",
      entityId: id,
      diff: { sku, title: input.title.trim(), status, quantity, priceCents: input.priceCents ?? 0 },
    }),
  ]);
  return { ok: true, id, sku, slug };
}

// ---------------------------------------------------------------------------
// Status change
// ---------------------------------------------------------------------------

export interface ChangeStatusInput {
  productId: string;
  to: ProductStatus;
  reason?: string;
  eventId?: string | null;
  /** Quantity to put back when a product with no stock is made available again. Default 1. */
  restoreQuantity?: number;
}

export async function changeStatus(
  db: Db,
  actor: Actor,
  input: ChangeStatusInput,
): Promise<{ ok: true; status: ProductStatus; quantity: number } | InventoryError> {
  const before = await loadSnapshot(db, input.productId);
  if (!before) return fail("NOT_FOUND", "That item doesn't exist.");

  const check = checkTransition({ from: before.status, to: input.to, role: actor.role, reason: input.reason });
  if (!check.ok) {
    return fail(check.code === "INVALID" ? "INVALID_TRANSITION" : check.code, check.message);
  }

  // SOLD means no stock left. Becoming available again needs stock to be put back.
  let quantity = before.quantity;
  if (input.to === "SOLD") quantity = 0;
  else if (STOCKED.includes(input.to) && quantity === 0) quantity = input.restoreQuantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 0) return fail("INVALID_QUANTITY", "Quantity must be a whole number, 0 or more.");

  const leavingReserved = before.status === "RESERVED" && input.to !== "RESERVED";
  const statements: Batchable[] = [
    db
      .update(products)
      .set({
        status: input.to,
        quantity,
        archivedAt: input.to === "ARCHIVED" ? new Date() : before.status === "ARCHIVED" ? null : undefined,
        ...(leavingReserved ? { reservedCustomerId: null, reservedNote: null, reservedUntil: null } : {}),
      })
      .where(and(eq(products.id, before.id), eq(products.status, before.status), eq(products.quantity, before.quantity))),
    ledgerAfterUpdate(db, {
      productId: before.id,
      fromStatus: before.status,
      delta: quantity - before.quantity,
      actor,
      notes: input.reason?.trim() ?? "",
      eventId: input.eventId,
    }),
    auditStatement(db, {
      userId: actor.id,
      action: "product.status",
      entityType: "product",
      entityId: before.id,
      diff: { status: { from: before.status, to: input.to }, quantity: { from: before.quantity, to: quantity } },
    }),
  ];
  const error = await runGuarded(db, statements);
  return error ?? { ok: true, status: input.to, quantity };
}

// ---------------------------------------------------------------------------
// Adjust stock (INV-12)
// ---------------------------------------------------------------------------

export async function adjustStock(
  db: Db,
  actor: Actor,
  input: { productId: string; newQuantity: number; reason: string },
): Promise<{ ok: true; status: ProductStatus; quantity: number } | InventoryError> {
  if (!input.reason.trim()) return fail("REASON_REQUIRED", "Please add a short reason for the stock change.");
  if (!Number.isInteger(input.newQuantity) || input.newQuantity < 0) {
    return fail("INVALID_QUANTITY", "Quantity must be a whole number, 0 or more.");
  }
  const before = await loadSnapshot(db, input.productId);
  if (!before) return fail("NOT_FOUND", "That item doesn't exist.");
  if (input.newQuantity === before.quantity) return fail("INVALID_QUANTITY", "That is already the quantity in stock.");

  const status = statusAfterStockChange(before.status, input.newQuantity);
  const error = await runGuarded(db, [
    db
      .update(products)
      .set({ status, quantity: input.newQuantity })
      .where(and(eq(products.id, before.id), eq(products.status, before.status), eq(products.quantity, before.quantity))),
    ledgerAfterUpdate(db, {
      productId: before.id,
      fromStatus: before.status,
      delta: input.newQuantity - before.quantity,
      actor,
      notes: input.reason.trim(),
    }),
    auditStatement(db, {
      userId: actor.id,
      action: "product.stock",
      entityType: "product",
      entityId: before.id,
      diff: { quantity: { from: before.quantity, to: input.newQuantity }, status: { from: before.status, to: status } },
    }),
  ]);
  return error ?? { ok: true, status, quantity: input.newQuantity };
}

// ---------------------------------------------------------------------------
// Bulk archive (undoing an import)
// ---------------------------------------------------------------------------

/**
 * Archives many products in chunks, one ledger row each. Used to undo an import. Archiving is a valid move from every
 * status. Each chunk is atomic, and a product that changed after it was read makes its chunk fail with CONFLICT.
 */
export async function archiveProducts(
  db: Db,
  actor: Actor,
  items: { id: string; status: ProductStatus; quantity: number }[],
  opts: { note: string; importBatchId?: string },
): Promise<{ ok: true; archived: number } | InventoryError> {
  const CHUNK = 25;
  let archived = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const statements: Batchable[] = chunk.flatMap((p) => [
      db
        .update(products)
        .set({ status: "ARCHIVED", archivedAt: new Date(), reservedCustomerId: null, reservedNote: null, reservedUntil: null })
        .where(and(eq(products.id, p.id), eq(products.status, p.status), eq(products.quantity, p.quantity))),
      ledgerAfterUpdate(db, { productId: p.id, fromStatus: p.status, delta: 0, actor, notes: opts.note, importBatchId: opts.importBatchId }),
    ]);
    const error = await runGuarded(db, statements);
    if (error) return error;
    archived += chunk.length;
  }
  return { ok: true, archived };
}

// ---------------------------------------------------------------------------
// Bulk moves (events, undoing an import)
// ---------------------------------------------------------------------------

export interface Move {
  id: string;
  from: ProductStatus;
  quantity: number;
  to: ProductStatus;
  /** Extra statements that must succeed or fail together with this move, for example the event link. */
  extra?: Batchable[];
}

/**
 * Moves many products to new statuses in chunks, one ledger row each. Each chunk is atomic, and a product that changed
 * after it was read makes its chunk fail with CONFLICT. The transition rules are checked here, so a bulk action can't do
 * what a single one is not allowed to.
 */
export async function moveProducts(
  db: Db,
  actor: Actor,
  moves: Move[],
  opts: { note: string; eventId?: string },
): Promise<{ ok: true; moved: number } | InventoryError> {
  for (const m of moves) {
    const check = checkTransition({ from: m.from, to: m.to, role: actor.role, reason: opts.note });
    if (!check.ok) return fail(check.code === "INVALID" ? "INVALID_TRANSITION" : check.code, check.message);
  }
  const CHUNK = 25;
  let moved = 0;
  for (let i = 0; i < moves.length; i += CHUNK) {
    const chunk = moves.slice(i, i + CHUNK);
    const statements: Batchable[] = chunk.flatMap((m) => [
      db
        .update(products)
        .set({ status: m.to })
        .where(and(eq(products.id, m.id), eq(products.status, m.from), eq(products.quantity, m.quantity))),
      ledgerAfterUpdate(db, { productId: m.id, fromStatus: m.from, delta: 0, actor, notes: opts.note, eventId: opts.eventId }),
      ...(m.extra ?? []),
    ]);
    const error = await runGuarded(db, statements);
    if (error) return error;
    moved += chunk.length;
  }
  return { ok: true, moved };
}

// ---------------------------------------------------------------------------
// Sale lines (used by the sale service in Phase 6)
// ---------------------------------------------------------------------------

/**
 * The two statements that take `quantity` units out of stock for one sale line. They must be run in the same
 * batch as the sale rows. If the item is not sellable or has too little stock the ledger INSERT fails, so the
 * whole sale rolls back and nothing is oversold (INV-11). The decrement is relative, so two buyers of an item
 * with several in stock both succeed.
 */
export function saleLineStatements(
  db: Db,
  line: { productId: string; fromStatus: ProductStatus; quantity: number; saleId: string; eventId?: string | null },
  actor: Actor,
): Batchable[] {
  const { productId, quantity } = line;
  return [
    db
      .update(products)
      .set({
        quantity: sql`${products.quantity} - ${quantity}`,
        status: sql`CASE WHEN ${products.quantity} - ${quantity} = 0 THEN 'SOLD' ELSE ${products.status} END`,
        // A reservation ends when the last unit is sold.
        reservedCustomerId: sql`CASE WHEN ${products.quantity} - ${quantity} = 0 THEN NULL ELSE ${products.reservedCustomerId} END`,
        reservedNote: sql`CASE WHEN ${products.quantity} - ${quantity} = 0 THEN NULL ELSE ${products.reservedNote} END`,
        reservedUntil: sql`CASE WHEN ${products.quantity} - ${quantity} = 0 THEN NULL ELSE ${products.reservedUntil} END`,
      })
      .where(
        and(
          eq(products.id, productId),
          gte(products.quantity, quantity),
          inArray(products.status, [...SELLABLE_STATUSES]),
        ),
      ),
    ledgerAfterUpdate(db, {
      productId,
      fromStatus: line.fromStatus,
      delta: -quantity,
      actor,
      notes: "Sale",
      eventId: line.eventId,
      saleId: line.saleId,
    }),
  ];
}

/**
 * The two statements that put `quantity` units back after a sale is voided. A product that sold out comes back as
 * `restoreStatus` (AVAILABLE, or AT_EVENT when it is still out at the event). Anything else keeps its status, so a piece
 * archived after the sale stays archived with its stock restored.
 */
export function voidLineStatements(
  db: Db,
  line: { productId: string; fromStatus: ProductStatus; quantity: number; saleId: string; eventId?: string | null; restoreStatus: "AVAILABLE" | "AT_EVENT" },
  actor: Actor,
): Batchable[] {
  const { productId, quantity } = line;
  return [
    db
      .update(products)
      .set({
        quantity: sql`${products.quantity} + ${quantity}`,
        status: sql`CASE WHEN ${products.status} = 'SOLD' THEN ${line.restoreStatus} ELSE ${products.status} END`,
      })
      .where(
        and(
          eq(products.id, productId),
          eq(products.status, line.fromStatus),
          // Checked before the sale row is changed, so a second void of the same sale matches nothing and the batch fails.
          sql`EXISTS (SELECT 1 FROM sale WHERE sale.id = ${line.saleId} AND sale.status = 'COMPLETED')`,
        ),
      ),
    ledgerAfterUpdate(db, {
      productId,
      fromStatus: line.fromStatus,
      delta: quantity,
      actor,
      notes: "Sale voided",
      eventId: line.eventId,
      saleId: line.saleId,
    }),
  ];
}
