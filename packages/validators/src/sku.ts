import { z } from "zod";

export const SKU_PREFIX = "FFA";
const SKU_DIGITS = 6;

export const skuSchema = z.string().regex(/^FFA-\d{6}$/, "Invalid SKU");

export function formatSku(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 10 ** SKU_DIGITS - 1) {
    throw new RangeError(`SKU number out of range: ${n}`);
  }
  return `${SKU_PREFIX}-${String(n).padStart(SKU_DIGITS, "0")}`;
}

export function parseSku(sku: string): number {
  return Number(skuSchema.parse(sku).slice(SKU_PREFIX.length + 1));
}
