import { describe, expect, it } from "vitest";
import { AA_LARGE, AA_NORMAL, contrast, luminance } from "./contrast";
import { colors, textPairs } from "./tokens";

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("rejects bad colours", () => {
    expect(() => luminance("red")).toThrow();
  });
});

describe("brand palette", () => {
  it("never uses pure black or pure white", () => {
    for (const hex of Object.values(colors)) {
      expect(hex.toUpperCase()).not.toBe("#000000");
      expect(hex.toUpperCase()).not.toBe("#FFFFFF");
    }
  });
  for (const pair of textPairs) {
    const need = pair.level === "normal" ? AA_NORMAL : AA_LARGE;
    it(`${pair.fg} on ${pair.bg} (${pair.use}) meets WCAG AA ${pair.level} text`, () => {
      expect(contrast(colors[pair.fg], colors[pair.bg])).toBeGreaterThanOrEqual(need);
    });
  }
});
