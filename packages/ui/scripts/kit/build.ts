import { optimize } from "svgo";
import { Resvg } from "@resvg/resvg-js";
import type { Palette } from "../brand/palette";
import { cornerOrnament, fern, lunaMoth, stagBeetle } from "../brand/art";
import { cicada, dragonfly, morpho, swallowtail } from "./butterflies";
import { resetIds, g, kitColour, kitGreen, kitLight } from "./toolkit";
import { atlasMoth, centipede, scarab } from "./creatures";
import { branch, divider, mark, mushrooms, sprig, spider, wildflowers } from "./plants";

export interface KitAsset {
  name: string;
  /** What it is for, shown on the style guide. */
  use: string;
  palette: Palette;
  draw: (p: Palette) => string;
  pad?: number;
  /** Hard ceiling for the optimised file, in bytes. A test enforces it (UX-9). */
  budget: number;
}

const frondFan = (p: Palette) =>
  g(fern(p, 200, 14), { transform: "translate(-26 0) rotate(-40)" }) + g(fern(p, 250, 17), { transform: "translate(0 0) rotate(-4)" }) + g(fern(p, 190, 13), { transform: "translate(26 0) rotate(34)" });

/** Every asset in the kit. Add a line here to add an asset. The build, the manifest and the style guide all follow this list. */
export const ASSETS: KitAsset[] = [
  { name: "luna-moth", use: "Hero accent, large", palette: kitColour, draw: lunaMoth, budget: 60_000 },
  { name: "stag-beetle", use: "Hero accent, large", palette: kitColour, draw: stagBeetle, budget: 60_000 },
  { name: "scarab", use: "Section accent", palette: kitColour, draw: scarab, budget: 40_000 },
  { name: "atlas-moth", use: "Hero accent, large", palette: kitColour, draw: atlasMoth, budget: 40_000 },
  { name: "morpho-butterfly", use: "Hero accent, large", palette: kitColour, draw: morpho, budget: 40_000 },
  { name: "swallowtail", use: "Hero accent, large", palette: kitColour, draw: swallowtail, budget: 40_000 },
  { name: "dragonfly", use: "Section accent", palette: kitColour, draw: dragonfly, budget: 40_000 },
  { name: "cicada", use: "Section accent", palette: kitColour, draw: cicada, budget: 40_000 },
  { name: "spider", use: "Hangs from a heading or card", palette: kitColour, draw: spider, budget: 30_000 },
  { name: "centipede", use: "Section accent and loaders", palette: kitColour, draw: centipede, budget: 30_000 },
  { name: "mushrooms", use: "Footer and empty states", palette: kitColour, draw: mushrooms, budget: 40_000 },
  { name: "leaf-sprig", use: "Background and borders", palette: kitGreen, draw: sprig, budget: 30_000 },
  { name: "branch", use: "Page edges", palette: kitColour, draw: branch, budget: 30_000 },
  { name: "wildflowers", use: "Background and empty states", palette: kitColour, draw: wildflowers, budget: 40_000 },
  { name: "fern", use: "Hero and section edges", palette: kitGreen, draw: frondFan, budget: 30_000 },
  { name: "corner", use: "Pointed frame corner (flip it for the other corners)", palette: kitColour, draw: (p) => cornerOrnament(p, 64), pad: 0, budget: 8_000 },
  { name: "divider-vine", use: "Divider on light grounds", palette: kitColour, draw: divider, budget: 20_000 },
  { name: "divider-vine-light", use: "Divider on the dark footer", palette: kitLight, draw: divider, budget: 20_000 },
  { name: "mark", use: "The small geometric moth", palette: kitColour, draw: mark, pad: 2, budget: 4_000 },
];

export interface BuiltAsset {
  name: string;
  svg: string;
  width: number;
  height: number;
}

/** The painted area of some artwork, found by rendering it. (Measuring shapes would count hatching that is clipped away.) */
function paintedBounds(inner: string): { x: number; y: number; width: number; height: number } {
  const half = 900;
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${half * 2} ${half * 2}" width="${half * 2}" height="${half * 2}">${inner}</svg>`;
  const image = new Resvg(probe).render();
  const { width, height } = image;
  const px = image.pixels;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3]! > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("the artwork drew nothing");
  return { x: minX - half, y: minY - half, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Draws one asset, fits its viewBox to the artwork, and optimises it. */
export function buildAsset(asset: KitAsset): BuiltAsset {
  resetIds();
  const inner = asset.draw(asset.palette);
  const box = paintedBounds(inner);
  const pad = asset.pad ?? 6;
  const x = Math.floor(box.x - pad);
  const y = Math.floor(box.y - pad);
  const width = Math.ceil(box.width + pad * 2);
  const height = Math.ceil(box.height + pad * 2);
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}">${inner}</svg>`;
  const svg = optimize(raw, { multipass: true, floatPrecision: 1, plugins: ["preset-default"] }).data;
  return { name: asset.name, svg, width, height };
}

export const buildAll = () => ASSETS.map(buildAsset);
