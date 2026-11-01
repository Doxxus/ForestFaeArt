import * as opentype from "opentype.js";
import type { Font } from "opentype.js";

export type { Font };

type OpentypeModule = { parse?: (b: ArrayBuffer) => Font; default?: { parse: (b: ArrayBuffer) => Font } };

/** Works whether the bundler exposes named exports or only a default export. */
export function parseFont(buffer: ArrayBuffer): Font {
  const mod = opentype as unknown as OpentypeModule;
  const parse = mod.parse ?? mod.default?.parse;
  if (!parse) throw new Error("opentype.js could not be loaded");
  return parse(buffer);
}

export const textWidth = (font: Font, text: string, size: number) => font.getAdvanceWidth(text, size);

const num = (v: number | undefined): string => {
  if (v === undefined || !Number.isFinite(v)) throw new Error("Glyph outline has a non-finite coordinate");
  return String(Math.round(v * 100) / 100);
};

/**
 * Serialises glyph outlines ourselves. opentype.js's own toPathData can emit NaN for some glyph
 * sequences (for example "Bot" at 20 px), which silently drops glyphs.
 */
export function textPath(font: Font, text: string, x: number, baselineY: number, size: number): string {
  const out: string[] = [];
  for (const c of font.getPath(text, x, baselineY, size).commands) {
    switch (c.type) {
      case "M":
      case "L":
        out.push(`${c.type}${num(c.x)} ${num(c.y)}`);
        break;
      case "Q":
        out.push(`Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`);
        break;
      case "C":
        out.push(`C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`);
        break;
      case "Z":
        out.push("Z");
        break;
    }
  }
  return out.join("");
}

/** Cap height approximation used to size lines. Barlow Condensed caps are about 0.7 em. */
export const lineHeight = (size: number) => Math.round(size * 1.08);

function ellipsize(font: Font, line: string, size: number, maxWidth: number): string {
  let out = line;
  while (out.length > 1 && textWidth(font, `${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** Greedy word wrap. Over-long words are only split when allowSplit is set. Returns null if it needs more than maxLines. */
export function wrap(
  font: Font,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
  allowSplit = false,
): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    let rest = word;
    while (textWidth(font, rest, size) > maxWidth) {
      if (!allowSplit) return null;
      let cut = rest.length - 1;
      while (cut > 1 && textWidth(font, rest.slice(0, cut), size) > maxWidth) cut--;
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    const candidate = current ? `${current} ${rest}` : rest;
    if (textWidth(font, candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines.length <= maxLines ? lines : null;
}

/** Largest size that fits, falling back to an ellipsis at the minimum size. */
export function fitText(
  font: Font,
  text: string,
  maxWidth: number,
  maxHeight: number,
  sizes: number[],
): { size: number; lines: string[] } {
  for (const size of sizes) {
    const maxLines = Math.floor(maxHeight / lineHeight(size));
    if (maxLines < 1) continue;
    const lines = wrap(font, text, size, maxWidth, maxLines);
    if (lines) return { size, lines };
  }
  const size = sizes[sizes.length - 1]!;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight(size)));
  const all = wrap(font, text, size, maxWidth, Number.MAX_SAFE_INTEGER, true) ?? [];
  const lines = all.slice(0, maxLines);
  if (all.length > maxLines) lines[maxLines - 1] = ellipsize(font, lines[maxLines - 1]!, size, maxWidth);
  return { size, lines };
}
