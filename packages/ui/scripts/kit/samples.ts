import { optimize } from "svgo";
import { lunaMoth } from "../brand/art";
import { morpho } from "./butterflies";
import { atlasMoth, scarab } from "./creatures";
import { paintedBounds } from "./build";
import { kitColour, resetIds, colors } from "./toolkit";

/** The four pictures for the sample pieces (SAMP-4): original drawings from the kit, styled as clearly-marked sample cards. */
export const SAMPLE_PICTURES = [
  { name: "blue-morpho", draw: morpho, label: "Blue Morpho" },
  { name: "atlas-moth", draw: atlasMoth, label: "Atlas Moth" },
  { name: "rainbow-scarab", draw: scarab, label: "Rainbow Scarab" },
  { name: "luna-moth", draw: lunaMoth, label: "Luna Moth" },
] as const;

export type SamplePictureName = (typeof SAMPLE_PICTURES)[number]["name"];

export const SAMPLE_SIZE = 800;
const ART_BOX = 520;

export interface BuiltSample {
  name: SamplePictureName;
  svg: string;
  width: number;
  height: number;
}

function card(label: string, inner: string): string {
  const box = paintedBounds(inner);
  const scale = Math.min(ART_BOX / box.width, ART_BOX / box.height);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = SAMPLE_SIZE / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SAMPLE_SIZE} ${SAMPLE_SIZE}" role="img" aria-label="Sample picture: ${label}">` +
    `<rect width="${SAMPLE_SIZE}" height="${SAMPLE_SIZE}" fill="${colors.sage}"/>` +
    `<rect x="36" y="36" width="${SAMPLE_SIZE - 72}" height="${SAMPLE_SIZE - 72}" rx="14" fill="${colors.cream}" stroke="${colors.copper}" stroke-width="4" stroke-dasharray="14 10"/>` +
    `<g transform="translate(${half} ${half - 20}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})">${inner}</g>` +
    `<rect x="${half - 180}" y="${SAMPLE_SIZE - 128}" width="360" height="56" rx="28" fill="${colors.forest}"/>` +
    `<text x="${half}" y="${SAMPLE_SIZE - 90}" text-anchor="middle" font-family="Georgia, serif" font-size="24" letter-spacing="4" fill="${colors.cream}">SAMPLE PICTURE</text>` +
    `</svg>`
  );
}

export function buildSamples(): BuiltSample[] {
  return SAMPLE_PICTURES.map((p) => {
    resetIds();
    const svg = optimize(card(p.label, p.draw(kitColour)), { multipass: true, floatPrecision: 1, plugins: ["preset-default"] }).data;
    return { name: p.name, svg, width: SAMPLE_SIZE, height: SAMPLE_SIZE };
  });
}

/** The module the API serves the sample pictures from. They are plain strings, so no storage or network is involved. */
export function sampleModule(built: BuiltSample[]): string {
  return (
    `// Written by "pnpm --filter @ffa/ui kit". Do not edit by hand.\n` +
    `export const SAMPLE_ART: Record<string, { svg: string; width: number; height: number }> = {\n` +
    built.map((b) => `  ${JSON.stringify(b.name)}: { width: ${b.width}, height: ${b.height}, svg: ${JSON.stringify(b.svg)} },`).join("\n") +
    `\n};\n`
  );
}
