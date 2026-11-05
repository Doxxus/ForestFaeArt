import { SKU_PREFIX } from "@ffa/validators";

/**
 * The SKU in whatever the camera read. Labels carry the product address (https://forestfae.ca/p/FFA-000123), but a
 * plain SKU, as typed or printed, works too. Returns null for anything else, so a stray QR code is ignored.
 */
export function parseScan(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > 300) return null;
  const sku = new RegExp(`(?:^|[/=])(${SKU_PREFIX}-?\\d{6})(?:$|[/?#&])`, "i").exec(text)?.[1];
  if (!sku) return null;
  const digits = sku.replace(/\D/g, "");
  return `${SKU_PREFIX}-${digits}`;
}

/** What someone typed in the box: a SKU in a looser form (ffa 123, FFA-123), or null so it is treated as a title search. */
export function looseSku(raw: string): string | null {
  const m = /^\s*(?:ffa)?[\s-]*(\d{1,6})\s*$/i.exec(raw);
  if (!m?.[1]) return null;
  return `${SKU_PREFIX}-${m[1].padStart(6, "0")}`;
}
