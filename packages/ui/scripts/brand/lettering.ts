import { parseFont, textPath, textWidth, type Font } from "@ffa/label-engine";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const load = (name: string): Font => {
  const buf = readFileSync(fileURLToPath(new URL(`../../fonts/${name}`, import.meta.url)));
  return parseFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

export interface BrandFonts {
  flared: Font; // Marcellus: flared serif caps
  naturalist: Font; // IM Fell English SC: vintage naturalist
  refined: Font; // Cormorant SC SemiBold
}

export const loadBrandFonts = (): BrandFonts => ({
  flared: load("Marcellus-Regular.ttf"),
  naturalist: load("IMFeENsc28P.ttf"),
  refined: load("CormorantSC-SemiBold.ttf"),
});

const f2 = (n: number) => Math.round(n * 100) / 100;

/** Width of letter-spaced text (the last glyph gets no trailing space). */
export function trackedWidth(font: Font, text: string, size: number, tracking: number): number {
  let w = 0;
  for (const ch of text) w += textWidth(font, ch, size) + tracking;
  return w - tracking;
}

/** Letter-spaced outlines starting at x. Returns path data (glyph outlines, no font needed to render). */
export function trackedPath(font: Font, text: string, x: number, y: number, size: number, tracking: number): string {
  let cursor = x;
  const out: string[] = [];
  for (const ch of text) {
    if (ch !== " ") out.push(textPath(font, ch, f2(cursor), y, size));
    cursor += textWidth(font, ch, size) + tracking;
  }
  return out.join("");
}

/** Centred on cx. */
export function centredPath(font: Font, text: string, cx: number, y: number, size: number, tracking: number): string {
  return trackedPath(font, text, cx - trackedWidth(font, text, size, tracking) / 2, y, size, tracking);
}

/**
 * Text bent around a circle. "top" reads left to right over the top, "bottom" reads left to right
 * along the bottom. `radius` is where the baseline sits. Each glyph is its own path element.
 */
export function arcText(
  font: Font,
  text: string,
  size: number,
  tracking: number,
  radius: number,
  position: "top" | "bottom",
): string {
  const total = trackedWidth(font, text, size, tracking);
  let cursor = -total / 2;
  const parts: string[] = [];
  for (const ch of text) {
    const adv = textWidth(font, ch, size);
    const mid = cursor + adv / 2;
    cursor += adv + tracking;
    if (ch === " ") continue;
    const angle = (mid / radius) * (180 / Math.PI);
    const glyph = textPath(font, ch, f2(-adv / 2), 0, size);
    parts.push(
      position === "top"
        ? `<path transform="rotate(${f2(angle)}) translate(0 ${-radius})" d="${glyph}"/>`
        : `<path transform="rotate(${f2(-angle)}) translate(0 ${radius})" d="${glyph}"/>`,
    );
  }
  return parts.join("");
}

export { textWidth };
