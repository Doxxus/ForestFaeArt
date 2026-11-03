import type { ProductStatus, UserRole } from "./enums";

interface Rule {
  /** The reason text is mandatory (shown to the owner as a short note). */
  reason?: true;
  /** Only an ADMIN may make this move (STAFF have no destructive actions, AUTH-4). */
  admin?: true;
}

/**
 * The only allowed status moves (INV-3). Anything not listed is rejected.
 * Stock changes that reach or leave zero are handled by `statusAfterStockChange`.
 */
export const STATUS_TRANSITIONS: Record<ProductStatus, Partial<Record<ProductStatus, Rule>>> = {
  DRAFT: { AVAILABLE: {}, ARCHIVED: { admin: true } },
  AVAILABLE: {
    DRAFT: {},
    RESERVED: {},
    AT_EVENT: {},
    PENDING_PAYMENT: {},
    SOLD: {},
    ARCHIVED: { admin: true },
  },
  RESERVED: { AVAILABLE: {}, AT_EVENT: {}, PENDING_PAYMENT: {}, SOLD: {}, ARCHIVED: { admin: true } },
  AT_EVENT: { AVAILABLE: {}, RESERVED: {}, PENDING_PAYMENT: {}, SOLD: {}, ARCHIVED: { admin: true } },
  PENDING_PAYMENT: { AVAILABLE: {}, AT_EVENT: {}, SOLD: {}, ARCHIVED: { admin: true } },
  SOLD: { AVAILABLE: { admin: true, reason: true }, ARCHIVED: { admin: true } },
  ARCHIVED: { DRAFT: { admin: true }, AVAILABLE: { admin: true } },
};

export type TransitionCheck = { ok: true } | { ok: false; code: "INVALID" | "FORBIDDEN" | "REASON_REQUIRED"; message: string };

export function checkTransition(input: {
  from: ProductStatus;
  to: ProductStatus;
  role: UserRole;
  reason?: string | null;
}): TransitionCheck {
  const { from, to, role } = input;
  const rule = STATUS_TRANSITIONS[from][to];
  if (from === to || !rule) {
    return { ok: false, code: "INVALID", message: `A product can't move from ${from} to ${to}.` };
  }
  if (rule.admin && role !== "ADMIN") {
    return { ok: false, code: "FORBIDDEN", message: "Only an administrator can make that change." };
  }
  if (rule.reason && !input.reason?.trim()) {
    return { ok: false, code: "REASON_REQUIRED", message: "Please add a short reason for this change." };
  }
  return { ok: true };
}

/** Statuses that mean "in stock and being offered in some way". */
const STOCKED: readonly ProductStatus[] = ["AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"];

/**
 * The status a product ends up in after its quantity changes (INV-12).
 * Reaching zero marks it SOLD. Restocking a SOLD product makes it AVAILABLE. DRAFT and ARCHIVED never change.
 */
export function statusAfterStockChange(status: ProductStatus, newQuantity: number): ProductStatus {
  if (!Number.isInteger(newQuantity) || newQuantity < 0) throw new RangeError("quantity must be an integer >= 0");
  if (newQuantity === 0 && STOCKED.includes(status)) return "SOLD";
  if (newQuantity > 0 && status === "SOLD") return "AVAILABLE";
  return status;
}

/** Statuses that can be sold to someone now (INV-10, INV-11). */
export const SELLABLE_STATUSES: readonly ProductStatus[] = ["AVAILABLE", "AT_EVENT", "RESERVED"];
