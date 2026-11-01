import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Bitmap } from "./types";

/** Node-only rasteriser (tests, CLI and server-side export). Antialiasing is thresholded to pure 1-bit. */
export function rasterize(svg: string, width: number, threshold = 128): Bitmap {
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: "#ffffff" }).render();
  const px = rendered.pixels;
  const black = new Uint8Array(rendered.width * rendered.height);
  for (let i = 0; i < black.length; i++) {
    const lum = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
    black[i] = lum < threshold ? 1 : 0;
  }
  return { width: rendered.width, height: rendered.height, black };
}

/** 8-bit greyscale PNG containing only 0 and 255, which the NIIMBOT app imports as a 1-bit image. */
export function toPng(bitmap: Bitmap, scale = 1): Uint8Array {
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const png = new PNG({ width: w, height: h, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = bitmap.black[Math.floor(y / scale) * bitmap.width + Math.floor(x / scale)] ? 0 : 255;
      png.data[(y * w + x) * 4] = v;
      png.data[(y * w + x) * 4 + 1] = v;
      png.data[(y * w + x) * 4 + 2] = v;
      png.data[(y * w + x) * 4 + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 0, inputColorType: 6, inputHasAlpha: true });
}

/** Thermal print spreads or loses ink. +1 grows black by one dot, -1 shrinks it. */
export function dotGain(bitmap: Bitmap, amount: -1 | 0 | 1): Bitmap {
  if (amount === 0) return bitmap;
  const { width, height, black } = bitmap;
  const out = new Uint8Array(black.length);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : black[y * width + x]!);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = [at(x, y), at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      out[y * width + x] = amount === 1 ? (n.some((v) => v === 1) ? 1 : 0) : n.every((v) => v === 1) ? 1 : 0;
    }
  }
  return { width, height, black: out };
}
