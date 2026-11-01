import jsQR from "jsqr";
import type { Bitmap } from "./types";

/** Decodes the QR in a rendered label. Returns the encoded text, or null if it cannot be read. */
export function decodeQr(bitmap: Bitmap, scale = 3): string | null {
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = bitmap.black[Math.floor(y / scale) * bitmap.width + Math.floor(x / scale)] ? 0 : 255;
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return jsQR(rgba, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
}
