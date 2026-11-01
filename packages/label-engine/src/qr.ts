import QRCode from "qrcode";

export interface QrMatrix {
  size: number;
  version: number;
  isDark(x: number, y: number): boolean;
}

export function buildQr(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const { size } = qr.modules;
  return { size, version: qr.version, isDark: (x, y) => qr.modules.get(y, x) === 1 };
}

/** Odd number of modules per side so the logo sits centred. Picks the odd size whose area is closest to the target, preferring the smaller on a tie. */
export function logoModules(size: number, areaRatio: number): number {
  if (areaRatio <= 0) return 0;
  const ideal = Math.sqrt(areaRatio) * size;
  const lower = Math.max(1, Math.floor(ideal) % 2 === 1 ? Math.floor(ideal) : Math.floor(ideal) - 1);
  const upper = lower + 2;
  const err = (side: number) => Math.abs((side * side) / (size * size) - areaRatio);
  return err(upper) < err(lower) ? upper : lower;
}

/** Dark modules as one SVG path of merged horizontal runs. Coordinates are in pixels. */
export function qrPath(qr: QrMatrix, moduleSize: number, x0: number, y0: number, logoSide: number): string {
  const start = Math.floor((qr.size - logoSide) / 2);
  const inLogo = (x: number, y: number) =>
    logoSide > 0 && x >= start && x < start + logoSide && y >= start && y < start + logoSide;
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let runStart = -1;
    for (let x = 0; x <= qr.size; x++) {
      const dark = x < qr.size && qr.isDark(x, y) && !inLogo(x, y);
      if (dark && runStart < 0) runStart = x;
      if (!dark && runStart >= 0) {
        parts.push(`M${x0 + runStart * moduleSize} ${y0 + y * moduleSize}h${(x - runStart) * moduleSize}v${moduleSize}h${-(x - runStart) * moduleSize}z`);
        runStart = -1;
      }
    }
  }
  return parts.join("");
}
