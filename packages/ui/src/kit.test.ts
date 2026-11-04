import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSETS, buildAll } from "../scripts/kit/build";

const webDir = fileURLToPath(new URL("../../../apps/web/", import.meta.url));
const read = (name: string) => readFileSync(`${webDir}public/kit/${name}.svg`, "utf8");

describe("the SVG kit (UX-9)", () => {
  it("has a file for every asset, within its size budget", () => {
    for (const asset of ASSETS) {
      const svg = read(asset.name);
      expect(Buffer.byteLength(svg), `${asset.name} is over its budget`).toBeLessThanOrEqual(asset.budget);
      expect(svg.startsWith("<svg"), `${asset.name} is not an svg`).toBe(true);
      expect(svg).toMatch(/viewBox="/);
    }
  });

  it("is self-contained: no scripts, pictures, fonts, links or external references", () => {
    for (const asset of ASSETS) {
      const svg = read(asset.name);
      for (const banned of ["<script", "<image", "<text", "<foreignObject", "font-family", "http://", "https://", "xlink:href", "javascript:", " onload=", " onclick="]) {
        // The xmlns namespace is the one allowed address.
        const cleaned = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
        expect(cleaned.includes(banned), `${asset.name} contains ${banned}`).toBe(false);
      }
    }
  });

  it("uses only the brand's colours", () => {
    const allowed = new Set(["#2b1e16", "#efe6cf", "#d9b15a", "#b4733a", "#86522a", "#2f4a3a", "#6f8a55", "#e8d9b0", "#f4efe3", "#b7c3a3", "#556b3a", "#a0652f", "#d6cfbf"]);
    for (const asset of ASSETS) {
      // Only real colours: attribute values that start with "#" and are exactly three or six hex digits (SVGO writes #ffffff as #fff).
      for (const [, hex] of read(asset.name).matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})"/g)) {
        const h = hex!.toLowerCase();
        expect(allowed.has(h) || h === "#fff" || h === "#000", `${asset.name} uses ${hex}`).toBe(true);
      }
    }
  });

  it("is up to date: the committed files match what the drawing code produces now", () => {
    for (const built of buildAll()) {
      expect(read(built.name), `${built.name}.svg is stale. Run: pnpm --filter @ffa/ui kit`).toBe(built.svg);
    }
  }, 120_000);

  it("names every asset once", () => {
    const names = ASSETS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
