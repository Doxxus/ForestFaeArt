import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import {
  directionAIcon,
  directionALockup,
  directionBIcon,
  directionBLockup,
  directionCIcon,
  directionCLockup,
  type Artwork,
} from "./brand/directions";
import { loadBrandFonts } from "./brand/lettering";
import { colour, mono, night } from "./brand/palette";

const outDir = fileURLToPath(new URL("../brand/logo-directions/", import.meta.url));
mkdirSync(outDir, { recursive: true });
const fonts = loadBrandFonts();

const sets: Array<{
  id: string;
  title: string;
  lockup: (p: typeof colour) => Artwork;
  icon: (p: typeof colour) => Artwork;
  colourPalette: typeof colour;
}> = [
  { id: "A-naturalist-banner", title: "A", lockup: (p) => directionALockup(p, fonts), icon: directionAIcon, colourPalette: colour },
  { id: "B-specimen-seal", title: "B", lockup: (p) => directionBLockup(p, fonts), icon: directionBIcon, colourPalette: night },
  { id: "C-minimal-mark", title: "C", lockup: (p) => directionCLockup(p, fonts), icon: directionCIcon, colourPalette: colour },
];

const png = (svg: string, width: number) => new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

for (const s of sets) {
  for (const [kind, palette] of [
    ["colour", s.colourPalette],
    ["mono", mono],
  ] as const) {
    const lockup = s.lockup(palette);
    const icon = s.icon(palette);
    writeFileSync(`${outDir}${s.id}-lockup-${kind}.svg`, lockup.svg);
    writeFileSync(`${outDir}${s.id}-icon-${kind}.svg`, icon.svg);
    writeFileSync(`${outDir}${s.id}-lockup-${kind}.png`, png(lockup.svg, 1400));
  }
  console.log(`wrote ${s.id}`);
}

// Comparison sheet: each direction in colour, in mono, and its icon at four sizes.
const nest = (art: Artwork, x: number, y: number, boxW: number, boxH = Number.POSITIVE_INFINITY) => {
  const scale = Math.min(boxW / art.width, boxH / art.height);
  const w = art.width * scale;
  const h = art.height * scale;
  const ox = x + (boxW - w) / 2;
  const oy = Number.isFinite(boxH) ? y + (boxH - h) / 2 : y;
  const body = art.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<g transform="translate(${ox} ${oy}) scale(${scale})">${body}</g>`;
};

const SHEET_W = 2000;
const rowH = 780;
let sheet = `<rect width="${SHEET_W}" height="${rowH * sets.length}" fill="#FAF7EF"/>`;
sets.forEach((s, i) => {
  const y = i * rowH;
  sheet += nest(s.lockup(s.colourPalette), 20, y + 20, 960, 500);
  sheet += nest(s.lockup(mono), 1020, y + 20, 960, 500);
  const icoCol = s.icon(s.colourPalette);
  const icoMon = s.icon(mono);
  let x = 40;
  for (const w of [220, 96, 48, 24]) {
    sheet += nest(icoCol, x, y + 540, w);
    x += w + 24;
  }
  x = 1040;
  for (const w of [220, 96, 48, 24]) {
    sheet += nest(icoMon, x, y + 540, w);
    x += w + 24;
  }
  sheet += `<line x1="0" y1="${y + rowH - 1}" x2="${SHEET_W}" y2="${y + rowH - 1}" stroke="#bbb" stroke-width="2"/>`;
});
const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${rowH * sets.length}" width="${SHEET_W}" height="${rowH * sets.length}">${sheet}</svg>`;
writeFileSync(`${outDir}comparison.svg`, sheetSvg);
writeFileSync(`${outDir}comparison.png`, png(sheetSvg, SHEET_W));
console.log(`Wrote comparison sheet to ${outDir}`);
