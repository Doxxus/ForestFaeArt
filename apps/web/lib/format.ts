import { formatCad } from "@ffa/validators";
import type { ProductStatus } from "@ffa/validators";

/** Owner-friendly wording for each status (INV-2). */
export const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  AT_EVENT: "At an event",
  PENDING_PAYMENT: "Awaiting payment",
  SOLD: "Sold",
  ARCHIVED: "Archived",
};

export const STATUS_TONE: Record<ProductStatus, "neutral" | "good" | "warn" | "bad"> = {
  DRAFT: "neutral",
  AVAILABLE: "good",
  RESERVED: "warn",
  AT_EVENT: "good",
  PENDING_PAYMENT: "warn",
  SOLD: "neutral",
  ARCHIVED: "bad",
};

export const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : formatCad(cents));

/** Dollars as typed in a form ("45", "45.50", "$1,200") to cents, or null if it isn't a valid amount. */
export function dollarsToCentsInput(raw: string): number | null {
  const s = raw.trim().replace(/^\$\s*/, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 10_000_000 ? cents : null;
}

/** Cents back to the plain "45.50" a form field expects. */
export const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));

export const dateTime = (d: Date | string | number) =>
  new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }).format(new Date(d));

/** The time zones an event might be in. Canadian ones, since the shop sells at Canadian markets. */
export const EVENT_TIME_ZONES: [string, string][] = [
  ["America/Toronto", "Eastern (Ontario, Quebec)"],
  ["America/Halifax", "Atlantic (Nova Scotia, New Brunswick)"],
  ["America/St_Johns", "Newfoundland"],
  ["America/Winnipeg", "Central (Manitoba)"],
  ["America/Regina", "Saskatchewan"],
  ["America/Edmonton", "Mountain (Alberta)"],
  ["America/Vancouver", "Pacific (British Columbia)"],
];

/** "Sat, Dec 5, 2026, 10:00 a.m. to 5:00 p.m." in the event's own zone, or both dates when it spans days. */
export function eventRange(start: Date | string | number, end: Date | string | number, timeZone: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const date = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });
  const time = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone });
  const sameDay = date.format(s) === date.format(e);
  return sameDay ? `${date.format(s)}, ${time.format(s)} to ${time.format(e)}` : `${date.format(s)}, ${time.format(s)} to ${date.format(e)}, ${time.format(e)}`;
}

/** What a card or page says where a price would be. A sold piece shows no price, and a hidden price invites an inquiry (WEB-4). */
export function priceLine(p: { status: "AVAILABLE" | "RESERVED" | "SOLD"; priceCents: number | null }): string {
  if (p.status === "SOLD") return "Sold";
  if (p.priceCents === null) return "Inquire for price";
  return money(p.priceCents);
}

/** Where the API serves a photo from, optionally resized. */
export function photoUrl(apiUrl: string, path: string, width?: number) {
  return `${apiUrl}${path}${width ? `?w=${width}` : ""}`;
}

/** A short message to carry through a redirect. */
export const flash = (key: "saved" | "error", text: string) => `${key}=${encodeURIComponent(text.slice(0, 300))}`;
