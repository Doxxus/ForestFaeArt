import { PAYMENT_METHOD_LABELS, SHOP_TIME_ZONE, formatCad } from "@ffa/validators";
import type { SaleDetail } from "../types";

export const money = (cents: number): string => formatCad(cents);

export const timeOf = (ms: number): string => new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: SHOP_TIME_ZONE }).format(new Date(ms));

export const dayAndTime = (ms: number): string => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: SHOP_TIME_ZONE }).format(new Date(ms));

/** "just now", "5 minutes ago", "2 hours ago" for the last-updated line. */
export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** A plain-text receipt for the Android share sheet (POS-11). No tax lines unless tax was actually charged (SALE-5). */
export function receiptText(sale: Pick<SaleDetail, "number" | "occurredAt" | "items" | "subtotalCents" | "discountCents" | "taxCents" | "totalCents" | "paymentMethod">, businessName: string): string {
  const lines = [
    `${businessName}`,
    `Receipt #${sale.number}, ${dayAndTime(sale.occurredAt)}`,
    "",
    ...sale.items.map((i) => `${i.quantity > 1 ? `${i.quantity} x ` : ""}${i.title} (${i.sku})  ${money(i.priceCents * i.quantity)}`),
    "",
    `Subtotal: ${money(sale.subtotalCents)}`,
  ];
  if (sale.discountCents > 0) lines.push(`Discount: -${money(sale.discountCents)}`);
  if (sale.taxCents > 0) lines.push(`Tax: ${money(sale.taxCents)}`);
  lines.push(`Total: ${money(sale.totalCents)}`);
  if (sale.paymentMethod) lines.push(`Paid by: ${PAYMENT_METHOD_LABELS[sale.paymentMethod]}`);
  lines.push("", "Thank you! Each piece is one of a kind.");
  return lines.join("\n");
}
