import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFont } from "./text";
import type { Fonts } from "./svg";

const load = (name: string) => {
  const buf = readFileSync(fileURLToPath(new URL(`../fonts/${name}`, import.meta.url)));
  return parseFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

/** Barlow Condensed (SIL OFL, see fonts/OFL.txt). Placeholder label font until the brand type is chosen. */
export function loadLabelFonts(): Fonts {
  return { regular: load("BarlowCondensed-Medium.ttf"), bold: load("BarlowCondensed-SemiBold.ttf") };
}
