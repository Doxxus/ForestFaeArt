import { AA_NORMAL, colors, contrast } from "@ffa/ui";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const variable = (name: string) => new RegExp(`--color-${name}: (#[0-9A-Fa-f]{6});`).exec(css)?.[1] ?? "";

// The Tailwind theme repeats the brand tokens as CSS. This keeps the two from drifting apart.
describe("theme", () => {
  it("matches the brand tokens", () => {
    for (const [name, hex] of Object.entries(colors)) {
      expect(css, name).toContain(`--color-${name.toLowerCase()}: ${hex};`);
    }
  });

  it("keeps status text at WCAG AA on its background", () => {
    expect(contrast(variable("danger"), variable("dangerbg"))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(variable("forest"), variable("okbg"))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(variable("danger"), colors.cream)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(variable("ink"), variable("dangerbg"))).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
