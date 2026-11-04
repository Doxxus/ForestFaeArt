import { describe, expect, it } from "vitest";
import {
  checkSlug,
  decodeMetadataValue,
  metadataKeyFromLabel,
  validateMetadataValue,
  type MetadataFieldDef,
  type MetadataFieldType,
} from "./index";

const field = (type: MetadataFieldType, options: string[] = []): MetadataFieldDef => ({
  key: "f",
  label: "Field",
  type,
  options: JSON.stringify(options),
});

describe("metadata values", () => {
  it("clears on empty input", () => {
    for (const empty of [null, undefined, "", []]) expect(validateMetadataValue(field("TEXT"), empty)).toEqual({ ok: true, value: null });
  });
  it("validates text", () => {
    expect(validateMetadataValue(field("TEXT"), "  Luna  ")).toEqual({ ok: true, value: "Luna" });
    expect(validateMetadataValue(field("TEXT"), 5)).toMatchObject({ ok: false });
    expect(validateMetadataValue(field("TEXT"), "x".repeat(501))).toMatchObject({ ok: false });
  });
  it("validates numbers and years", () => {
    expect(validateMetadataValue(field("NUMBER"), "3.5")).toEqual({ ok: true, value: "3.5" });
    expect(validateMetadataValue(field("NUMBER"), "abc")).toMatchObject({ ok: false });
    expect(validateMetadataValue(field("YEAR"), 2026)).toEqual({ ok: true, value: "2026" });
    expect(validateMetadataValue(field("YEAR"), "26")).toMatchObject({ ok: false });
    expect(validateMetadataValue(field("YEAR"), 2026.5)).toMatchObject({ ok: false });
  });
  it("validates yes/no", () => {
    expect(validateMetadataValue(field("YES_NO"), true)).toEqual({ ok: true, value: "true" });
    expect(validateMetadataValue(field("YES_NO"), "false")).toEqual({ ok: true, value: "false" });
    expect(validateMetadataValue(field("YES_NO"), "maybe")).toMatchObject({ ok: false });
  });
  it("matches select choices ignoring case and keeps the field's spelling", () => {
    const f = field("SELECT", ["Ethically sourced", "Other"]);
    expect(validateMetadataValue(f, " ethically SOURCED ")).toEqual({ ok: true, value: "Ethically sourced" });
    expect(validateMetadataValue(f, "Stolen")).toMatchObject({ ok: false });
  });
  it("validates multi-select, removing duplicates", () => {
    const f = field("MULTI_SELECT", ["Rare", "Gold", "Small"]);
    expect(validateMetadataValue(f, ["rare", "Gold", "RARE"])).toEqual({ ok: true, value: '["Rare","Gold"]' });
    expect(validateMetadataValue(f, ["Rare", "Huge"])).toMatchObject({ ok: false });
    expect(validateMetadataValue(f, "Rare")).toMatchObject({ ok: false });
  });
  it("round-trips through decode", () => {
    expect(decodeMetadataValue("YEAR", "2026")).toBe(2026);
    expect(decodeMetadataValue("YES_NO", "true")).toBe(true);
    expect(decodeMetadataValue("MULTI_SELECT", '["a","b"]')).toEqual(["a", "b"]);
    expect(decodeMetadataValue("TEXT", "hi")).toBe("hi");
  });
  it("makes keys from labels", () => {
    expect(metadataKeyFromLabel("Frame Color")).toBe("frame_color");
    expect(metadataKeyFromLabel("  Wing-span (cm) ")).toBe("wing_span_cm");
    expect(metadataKeyFromLabel("???")).toBe("field");
  });
});

describe("slug rules", () => {
  it("accepts clean slugs and rejects bad ones", () => {
    expect(checkSlug("luna-moth-2")).toBeNull();
    for (const bad of ["Luna", "luna_moth", "-luna", "luna--moth", "", "a".repeat(81)]) expect(checkSlug(bad)).not.toBeNull();
  });
  it("refuses slugs that look like a SKU", () => {
    expect(checkSlug("ffa-000123")).toMatch(/SKU/);
  });
});
