import { z } from "zod";

// Money is always integer CAD cents.
export const centsSchema = z.number().int().nonnegative();

export function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    centsSchema.parse(cents) / 100,
  );
}

export function dollarsToCents(input: string): number {
  const match = /^\$?\s*(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new RangeError(`Invalid amount: ${input}`);
  const [, whole = "0", frac = ""] = match;
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
