import { describe, expect, it } from "vitest";
import { AA_LARGE, AA_NORMAL, blend, contrast, luminance } from "./contrast";
import { PANEL_OPACITY, colors, textPairs, world } from "./tokens";

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("rejects bad colours", () => {
    expect(() => luminance("red")).toThrow();
  });
  it("blends a colour over another", () => {
    expect(blend("#FFFFFF", "#000000", 0.5)).toBe("#808080");
    expect(blend("#102030", "#FFFFFF", 1)).toBe("#102030");
    expect(blend("#102030", "#FFFFFF", 0)).toBe("#FFFFFF");
  });
});

describe("the green world (ADR 012)", () => {
  it("never uses pure black or pure white", () => {
    for (const hex of Object.values(world)) {
      expect(hex.toUpperCase()).not.toBe("#000000");
      expect(hex.toUpperCase()).not.toBe("#FFFFFF");
    }
  });

  it("goes from light at the sky to dark at the forest floor", () => {
    const order = [world.sky, world.mist, world.hillFar, world.meadow, world.hillMid, world.leaf, world.canopy, world.pine, world.floor];
    for (let i = 1; i < order.length; i++) expect(luminance(order[i]!), `${order[i]} should be darker than ${order[i - 1]}`).toBeLessThan(luminance(order[i - 1]!));
  });

  it("keeps the floor the same as brand forest, so the footer and the scene meet", () => {
    expect(world.floor).toBe(colors.forest);
  });

  // The reading panels are cream with a little see-through. The worst case is the darkest thing in the scene behind them.
  const panelWorstCase = blend(colors.cream, world.floor, PANEL_OPACITY);
  it("keeps panel text at WCAG AA over the darkest scenery", () => {
    for (const fg of ["ink", "forest", "moss", "copperDeep"] as const) {
      expect(contrast(colors[fg], panelWorstCase), `${fg} on a panel over the forest floor`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
  it("keeps text on the solid parchment cards inside a panel at WCAG AA", () => {
    for (const fg of ["ink", "forest", "moss", "copperDeep"] as const) {
      expect(contrast(colors[fg], colors.parchment), `${fg} on parchment`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
  it("keeps the panels from being too see-through", () => {
    expect(PANEL_OPACITY).toBeGreaterThanOrEqual(0.9);
    expect(PANEL_OPACITY).toBeLessThan(1);
  });
  it("keeps the hero text readable on the sky and meadow it sits on", () => {
    expect(contrast(colors.forest, world.sky)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(colors.forest, world.meadow)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(colors.ink, world.meadow)).toBeGreaterThanOrEqual(AA_NORMAL);
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
