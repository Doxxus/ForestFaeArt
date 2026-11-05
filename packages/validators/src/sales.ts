import { z } from "zod";
import { PAYMENT_METHODS, SALE_CHANNELS, type PaymentMethod, type SaleChannel, type UserRole } from "./enums";
import { localToUtcMs, utcMsToLocal } from "./events";
import { centsSchema } from "./money";

// Sales, customers and the revenue tracker. Pure rules shared by the API, the admin and the POS app. No database.

/** Days and "today" mean this zone (the owner's shop), not the phone's or the server's. */
export const SHOP_TIME_ZONE = "America/Toronto";

export const SALE_LIMITS = {
  maxLines: 30,
  maxQuantityPerLine: 99,
  /** A phone's clock can be a little fast. More than this and the sale is recorded as happening now. */
  maxFutureSkewMs: 10 * 60_000,
  /** A queued sale older than this is still accepted, but its time is kept as the server's now. */
  maxBackdateMs: 14 * 24 * 3600_000,
} as const;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  E_TRANSFER: "E-transfer",
  OTHER: "Other",
};

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  ONLINE: "Online",
  MARKET: "Market or event",
  CUSTOM: "Custom order",
  INSTAGRAM: "Instagram",
  ETSY: "Etsy",
  PHONE: "Phone",
};

/** The channels the POS offers at an event or at home. ONLINE is reserved for the future shop. */
export const POS_CHANNELS: readonly SaleChannel[] = ["MARKET", "ETSY", "INSTAGRAM", "CUSTOM", "PHONE"];

export const DEFAULT_PAYMENT_METHODS: readonly PaymentMethod[] = PAYMENT_METHODS;

const id = z.string().min(1).max(40);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, { message: "Enter a valid email address" });

export const customerFieldsSchema = z.object({
  firstName: optionalText(80),
  lastName: optionalText(80),
  email: optionalEmail.default(""),
  phone: optionalText(40),
  notes: optionalText(2000),
  marketingConsent: z.boolean().default(false),
});
export type CustomerFields = z.infer<typeof customerFieldsSchema>;

/** A customer needs at least a name, an email or a phone number. Nothing else is required (POS-6). */
export const customerSchema = customerFieldsSchema.refine((c) => [c.firstName, c.lastName, c.email, c.phone].some((v) => v.trim() !== ""), {
  message: "Add a name, an email or a phone number.",
});

export const saleItemInputSchema = z.object({
  productId: id,
  quantity: z.number().int().min(1).max(SALE_LIMITS.maxQuantityPerLine).default(1),
});

export const saleInputSchema = z
  .object({
    /** Made by the app for each sale. Sending the same key again never records a second sale. */
    idempotencyKey: z.string().min(8).max(64),
    channel: z.enum(SALE_CHANNELS).default("MARKET"),
    eventId: id.nullish(),
    customerId: id.nullish(),
    newCustomer: customerSchema.nullish(),
    items: z.array(saleItemInputSchema).min(1).max(SALE_LIMITS.maxLines),
    paymentMethod: z.enum(PAYMENT_METHODS),
    discountCents: centsSchema.default(0),
    discountReason: z.string().trim().max(200).default(""),
    notes: z.string().trim().max(500).default(""),
    /** When the sale really happened on the device (UTC milliseconds). Sales made offline arrive later. */
    occurredAt: z.number().int().positive().optional(),
    /** Where to email a receipt. Optional. */
    receiptEmail: optionalEmail.optional(),
  })
  .refine((s) => s.discountCents === 0 || s.discountReason !== "", { message: "Please say why there is a discount.", path: ["discountReason"] })
  .refine((s) => !(s.customerId && s.newCustomer), { message: "Choose an existing customer or add a new one, not both.", path: ["customerId"] });
export type SaleInput = z.infer<typeof saleInputSchema>;

export interface PricedLine {
  priceCents: number;
  quantity: number;
}

export type SaleTotals = { ok: true; subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } | { ok: false; message: string };

/**
 * Subtotal, discount and total for a sale. Tax is always 0 while the owner is not GST/HST registered (SALE-5), and the
 * calculation for when they are registered is a later phase, so it is 0 here too.
 */
export function saleTotals(lines: readonly PricedLine[], discountCents = 0): SaleTotals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  if (!Number.isInteger(discountCents) || discountCents < 0) return { ok: false, message: "The discount must be 0 or more." };
  if (discountCents > subtotalCents) return { ok: false, message: "The discount can't be more than the total." };
  return { ok: true, subtotalCents, discountCents, taxCents: 0, totalCents: subtotalCents - discountCents };
}

const localDay = (ms: number) => utcMsToLocal(ms, SHOP_TIME_ZONE).slice(0, 10);

/** Stops a spreadsheet from running a typed value as a formula (a name like "=HYPERLINK(...)"). Use on every exported cell that a person typed. */
export const csvCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** Staff can undo a sale made today. An administrator can undo any sale (POS-12, AUTH-4). */
export function canVoidSale(role: UserRole, occurredAt: number, now: number): boolean {
  return role === "ADMIN" || localDay(occurredAt) === localDay(now);
}

/**
 * The time to record for a sale. A phone's clock may be wrong, so a time in the future or older than the limit becomes
 * "now". The sale is still recorded, because the money and the stock already changed hands.
 */
export function resolveOccurredAt(claimed: number | undefined, now: number): number {
  if (claimed === undefined) return now;
  if (claimed > now + SALE_LIMITS.maxFutureSkewMs) return now;
  if (claimed < now - SALE_LIMITS.maxBackdateMs) return now;
  return Math.min(claimed, now);
}

// ---------------------------------------------------------------------------
// Reporting periods and the small-supplier threshold
// ---------------------------------------------------------------------------

export const SALE_PERIODS = ["today", "week", "month", "year"] as const;
export type SalePeriod = (typeof SALE_PERIODS)[number];

/** The start of a period (midnight in the shop's zone). Weeks start on Monday. */
export function periodStartMs(period: SalePeriod, now: number): number {
  const today = localDay(now);
  const [y = 1970, m = 1, d = 1] = today.split("-").map(Number);
  let date = today;
  if (period === "month") date = `${y}-${String(m).padStart(2, "0")}-01`;
  if (period === "year") date = `${y}-01-01`;
  if (period === "week") {
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    date = new Date(Date.UTC(y, m - 1, d - dow)).toISOString().slice(0, 10);
  }
  return localToUtcMs(`${date}T00:00`, SHOP_TIME_ZONE) ?? now;
}

/** The start of the next local day after `ms`, for "up to and including this day" ranges. */
export function nextDayStartMs(ms: number): number {
  const [y = 1970, m = 1, d = 1] = localDay(ms).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return localToUtcMs(`${next}T00:00`, SHOP_TIME_ZONE) ?? ms + 24 * 3600_000;
}

/** A "YYYY-MM-DD" date typed in a form, as the start of that day in the shop's zone. */
export function dayStartMs(day: string): number | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? localToUtcMs(`${day}T00:00`, SHOP_TIME_ZONE) : null;
}

export interface ThresholdStatus {
  revenueCents: number;
  thresholdCents: number;
  /** Rounded down, and can pass 100. */
  percent: number;
  level: "ok" | "warn" | "over";
}

export const THRESHOLD_WARN_AT = 0.8;

/**
 * Revenue against the GST/HST small-supplier limit (SALE-6). This is an early warning, not tax advice: the CRA counts four
 * consecutive calendar quarters, and this uses the last 12 months, so the owner should confirm with an accountant.
 */
export function thresholdStatus(revenueCents: number, thresholdCents: number): ThresholdStatus {
  const ratio = thresholdCents > 0 ? revenueCents / thresholdCents : 0;
  return {
    revenueCents,
    thresholdCents,
    percent: Math.floor(ratio * 100),
    level: ratio >= 1 ? "over" : ratio >= THRESHOLD_WARN_AT ? "warn" : "ok",
  };
}

/** The start of the 12-month window: the same date one year ago, at midnight in the shop's zone. */
export function trailingYearStartMs(now: number): number {
  const [y = 1970, m = 1, d = 1] = localDay(now).split("-").map(Number);
  const start = `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return localToUtcMs(`${start}T00:00`, SHOP_TIME_ZONE) ?? now - 365 * 24 * 3600_000;
}
