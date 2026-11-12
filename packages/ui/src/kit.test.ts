import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSETS, buildAll } from "../scripts/kit/build";
import { buildSamples, sampleModule } from "../scripts/kit/samples";
import { SCENE_ASSETS, buildScene } from "../scripts/kit/scenery";
import { colors, world } from "./tokens";

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

describe("the sample pictures (SAMP-4)", () => {
  const file = fileURLToPath(new URL("../../../apps/api/src/media/sample-art.generated.ts", import.meta.url));

  it("are up to date: the file the API serves matches what the drawing code produces now", () => {
    expect(readFileSync(file, "utf8"), "sample-art.generated.ts is stale. Run: pnpm --filter @ffa/ui kit").toBe(sampleModule(buildSamples()));
  }, 120_000);

  it("are self-contained and small", () => {
    for (const s of buildSamples()) {
      for (const banned of ["<script", "<image", "<foreignObject", "xlink:href", "javascript:", " onload=", " onclick="]) {
        expect(s.svg.includes(banned), `${s.name} contains ${banned}`).toBe(false);
      }
      expect(s.svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:\/\//);
      expect(Buffer.byteLength(s.svg)).toBeLessThan(20_000);
    }
  });

  it("says they are samples", () => {
    for (const s of buildSamples()) expect(s.svg).toContain("SAMPLE PICTURE");
  });
});

describe("the public site's scenery (ADR 012)", () => {
  const readScene = (name: string) => readFileSync(`${webDir}public/scene/${name}.svg`, "utf8");
  const expand = (hex: string) => (hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex).toLowerCase();

  it("has a file for every piece, within its size budget", () => {
    for (const asset of SCENE_ASSETS) {
      const svg = readScene(asset.name);
      expect(Buffer.byteLength(svg), `${asset.name} is over its budget`).toBeLessThanOrEqual(asset.budget);
      expect(svg).toMatch(/^<svg[^>]* viewBox="/);
    }
  });

  it("keeps what loads with the home page small (about 60 KB of scenery, ADR 012)", () => {
    const first = SCENE_ASSETS.filter((a) => a.firstPaint).reduce((sum, a) => sum + Buffer.byteLength(readScene(a.name)), 0);
    expect(first).toBeLessThanOrEqual(60_000);
  });

  it("is self-contained: no scripts, pictures, text, fonts or links", () => {
    for (const asset of SCENE_ASSETS) {
      const svg = readScene(asset.name).replace('xmlns="http://www.w3.org/2000/svg"', "");
      for (const banned of ["<script", "<image", "<text", "<foreignObject", "<style", "font-family", "http://", "https://", "xlink:href", "javascript:", " onload=", " onclick=", "<animate"]) {
        expect(svg.includes(banned), `${asset.name} contains ${banned}`).toBe(false);
      }
    }
  });

  it("uses only the brand colours and the green world's colours", () => {
    const allowed = new Set([...Object.values(colors), ...Object.values(world), "#a0652f"].map((h) => h.toLowerCase()));
    for (const asset of SCENE_ASSETS) {
      for (const [, hex] of readScene(asset.name).matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})"/g)) {
        const h = expand(hex!);
        expect(allowed.has(h) || h === "#ffffff" || h === "#000000", `${asset.name} uses ${hex}`).toBe(true);
      }
    }
  });

  it("is up to date: the committed files match what the drawing code produces now", () => {
    for (const built of buildScene()) {
      expect(readScene(built.name), `${built.name}.svg is stale. Run: pnpm --filter @ffa/ui kit`).toBe(built.svg);
    }
  }, 120_000);

  it("names every piece once", () => {
    const names = SCENE_ASSETS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
