import { describe, expect, it } from "vitest";
import { dollarsToCents, formatCad, formatSku, parseSku } from "./index";

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
