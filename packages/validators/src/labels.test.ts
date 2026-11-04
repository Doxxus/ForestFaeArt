import { describe, expect, it } from "vitest";
import { B1_MAX_WIDTH_MM, LABEL_LIMITS, LABEL_PRESETS, labelTemplateBodySchema, sheetOptionsSchema, sizeLabel } from "./labels";

const good = LABEL_PRESETS[0]!.body;

describe("label presets (LBL-2)", () => {
  it("ships 40x30 first, then the large, wide and jewelry sizes the spec asks for", () => {
    expect(LABEL_PRESETS.map((p) => sizeLabel(p.body))).toEqual(["40 x 30 mm", "40 x 70 mm", "50 x 30 mm", "30 x 15 mm"]);
  });
  it("are all valid templates with unique keys and names", () => {
    for (const p of LABEL_PRESETS) expect(labelTemplateBodySchema.safeParse(p.body).success).toBe(true);
    expect(new Set(LABEL_PRESETS.map((p) => p.key)).size).toBe(LABEL_PRESETS.length);
    expect(new Set(LABEL_PRESETS.map((p) => p.body.name)).size).toBe(LABEL_PRESETS.length);
  });
  it("keep every preset within what the B1 can print", () => {
    for (const p of LABEL_PRESETS) expect(p.body.widthMm).toBeLessThanOrEqual(B1_MAX_WIDTH_MM);
  });
});

describe("label template rules", () => {
  const bad = (patch: object) => labelTemplateBodySchema.safeParse({ ...good, ...patch });
  it("accepts the limits and rejects beyond them", () => {
    expect(bad({ widthMm: LABEL_LIMITS.sizeMm.min }).success).toBe(true);
    expect(bad({ widthMm: LABEL_LIMITS.sizeMm.max }).success).toBe(true);
    expect(bad({ widthMm: LABEL_LIMITS.sizeMm.min - 1 }).success).toBe(false);
    expect(bad({ heightMm: LABEL_LIMITS.sizeMm.max + 1 }).success).toBe(false);
    expect(bad({ textScale: 0.1 }).success).toBe(false);
    expect(bad({ logoAreaRatio: 0.5 }).success).toBe(false);
    expect(bad({ marginMm: -1 }).success).toBe(false);
  });
  it("needs a name and at least one thing to show", () => {
    expect(bad({ name: "   " }).success).toBe(false);
    expect(bad({ show: { qr: false, sku: false, title: false, price: false } }).success).toBe(false);
    expect(bad({ show: { qr: false, sku: true, title: false, price: false } }).success).toBe(true);
  });
  it("refuses margins that leave no room", () => {
    expect(bad({ widthMm: 12, heightMm: 12, marginMm: 6 }).success).toBe(false);
    expect(bad({ widthMm: 12, heightMm: 12, marginMm: 5 }).success).toBe(true);
  });
  it("rejects NaN, which a half-typed number becomes", () => {
    expect(bad({ widthMm: Number.NaN }).success).toBe(false);
  });
});

describe("sheet options", () => {
  it("validates margins, gaps, marks and the start cell", () => {
    expect(sheetOptionsSchema.safeParse({ marginMm: 5, gapMm: 0, marks: "crop", startCell: 3 }).success).toBe(true);
    expect(sheetOptionsSchema.safeParse({ marginMm: 5, gapMm: 0, marks: "stripes", startCell: 0 }).success).toBe(false);
    expect(sheetOptionsSchema.safeParse({ marginMm: -1, gapMm: 0, marks: "none", startCell: 0 }).success).toBe(false);
    expect(sheetOptionsSchema.safeParse({ marginMm: 5, gapMm: 0, marks: "none", startCell: 1.5 }).success).toBe(false);
  });
});

describe("sizeLabel", () => {
  it("drops needless decimals", () => {
    expect(sizeLabel({ widthMm: 40, heightMm: 30 })).toBe("40 x 30 mm");
    expect(sizeLabel({ widthMm: 37.5, heightMm: 22.25 })).toBe("37.5 x 22.25 mm");
  });
});
