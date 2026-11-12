/** WCAG 2.1 relative luminance and contrast ratio for #RRGGBB colours. */
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected #RRGGBB, got ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour you see when `top` is laid over `under` at the given opacity (0 to 1). */
export function blend(top: string, under: string, opacity: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = channels(top).map((v, i) => Math.round(v * opacity + channels(under)[i]! * (1 - opacity)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** AA needs 4.5:1 for normal text, 3:1 for large text (18 pt, or 14 pt bold) and for UI graphics. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
