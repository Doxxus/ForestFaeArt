import { describe, expect, it } from "vitest";
import { dollarsToCents, formatCad, formatSku, newId, parseSku, ulidSchemaPattern } from "./index";

describe("ids", () => {
  it("makes 26-character ULIDs that sort by time", () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a).toMatch(ulidSchemaPattern);
    expect(a < b).toBe(true);
  });
  it("is unique across a burst in the same millisecond", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId(1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });
});

describe("sku", () => {
  it("formats and parses", () => {
    expect(formatSku(123)).toBe("FFA-000123");
    expect(parseSku("FFA-000123")).toBe(123);
  });
  it("rejects out-of-range and malformed values", () => {
    expect(() => formatSku(0)).toThrow();
    expect(() => formatSku(1_000_000)).toThrow();
    expect(() => parseSku("FFA-12")).toThrow();
  });
});

describe("money", () => {
  it("converts dollars to cents without float error", () => {
    expect(dollarsToCents("$19.99")).toBe(1999);
    expect(dollarsToCents("5")).toBe(500);
    expect(dollarsToCents("0.5")).toBe(50);
  });
  it("rejects bad input", () => {
    expect(() => dollarsToCents("abc")).toThrow();
    expect(() => dollarsToCents("-1")).toThrow();
  });
  it("formats CAD", () => {
    expect(formatCad(1999)).toContain("19.99");
  });
});
