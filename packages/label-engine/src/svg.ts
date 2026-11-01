import { logoSvg } from "./logo";
import { buildQr, logoModules, qrPath } from "./qr";
import { fitText, lineHeight, textPath, textWidth, type Font } from "./text";
import { DEFAULT_TEMPLATE, formatLabelPrice, mmToPx, productUrl, type LabelInput, type LabelTemplate } from "./types";

export interface Fonts {
  regular: Font;
  bold: Font;
}

export interface RenderedLabel {
  svg: string;
  width: number;
  height: number;
  url: string;
  qrVersion: number;
  moduleSize: number;
  logoAreaActual: number;
  /** Price font size in px, 0 when the label has no price. */
  priceSize: number;
}

const TITLE_SIZES = [30, 28, 26, 24, 22, 20];
// Big enough to read from a distance. Shrinks only if a long price would not fit the column.
const PRICE_SIZES = [48, 44, 40, 36, 32, 28];
const SKU_SIZE = 26;
const TEST_SIZE = 22;

/**
 * Default layout: QR on the left with the logo in its centre and the SKU underneath,
 * title on the right with the price directly under it. Everything is drawn as paths
 * (text included), so the SVG renders identically anywhere with no fonts installed.
 */
export function renderLabelSvg(
  input: LabelInput,
  fonts: Fonts,
  template: LabelTemplate = DEFAULT_TEMPLATE,
): RenderedLabel {
  const W = mmToPx(template.widthMm, template.dpi);
  const H = mmToPx(template.heightMm, template.dpi);
  const margin = mmToPx(template.marginMm, template.dpi);
  const gap = Math.round(W * 0.04);

  const url = productUrl(input.baseUrl, input.sku, template.uppercaseUrl);
  const qr = buildQr(url);

  const skuH = lineHeight(SKU_SIZE);
  const blockMaxH = H - 2 * margin;
  const qrMaxPx = Math.min(blockMaxH - skuH - 6, Math.round(W * 0.55));
  const moduleSize = Math.max(1, Math.floor(qrMaxPx / qr.size));
  const qrPx = moduleSize * qr.size;

  const blockH = qrPx + 6 + skuH;
  const qrX = margin;
  const qrY = margin + Math.round((blockMaxH - blockH) / 2);

  const logoSide = logoModules(qr.size, template.logoAreaRatio);
  const logoAreaActual = logoSide ? (logoSide * logoSide) / (qr.size * qr.size) : 0;

  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  parts.push(`<path fill="#000" shape-rendering="crispEdges" d="${qrPath(qr, moduleSize, qrX, qrY, logoSide)}"/>`);
  if (logoSide) {
    const start = Math.floor((qr.size - logoSide) / 2);
    const logoPx = logoSide * moduleSize;
    const inset = Math.round(moduleSize * 0.5);
    parts.push(logoSvg(qrX + start * moduleSize + inset, qrY + start * moduleSize + inset, logoPx - 2 * inset));
  }

  const skuWidth = textWidth(fonts.bold, input.sku, SKU_SIZE);
  const skuX = qrX + (qrPx - skuWidth) / 2;
  const skuBaseline = qrY + qrPx + 6 + Math.round(SKU_SIZE * 0.82);
  parts.push(`<path fill="#000" d="${textPath(fonts.bold, input.sku, skuX, skuBaseline, SKU_SIZE)}"/>`);

  const colX = qrX + qrPx + gap;
  const colW = W - margin - colX;
  const hasPrice = input.priceCents !== null;
  const priceText = hasPrice ? formatLabelPrice(input.priceCents!) : "";
  const priceSize = hasPrice
    ? (PRICE_SIZES.find((s) => textWidth(fonts.bold, priceText, s) <= colW) ?? PRICE_SIZES[PRICE_SIZES.length - 1]!)
    : 0;
  const testH = input.isTest ? lineHeight(TEST_SIZE) + 6 : 0;
  const priceH = hasPrice ? lineHeight(priceSize) + 4 : 0;
  const titleMaxH = H - 2 * margin - priceH - testH;

  const title = fitText(fonts.bold, input.title, colW, titleMaxH, TITLE_SIZES);
  let y = margin;
  for (const line of title.lines) {
    const baseline = y + Math.round(title.size * 0.82);
    parts.push(`<path fill="#000" d="${textPath(fonts.bold, line, colX, baseline, title.size)}"/>`);
    y += lineHeight(title.size);
  }

  if (hasPrice) {
    y += 4;
    const baseline = y + Math.round(priceSize * 0.82);
    parts.push(`<path fill="#000" d="${textPath(fonts.bold, priceText, colX, baseline, priceSize)}"/>`);
  }

  if (input.isTest) {
    const barH = lineHeight(TEST_SIZE);
    const barY = H - margin - barH;
    const textW = textWidth(fonts.bold, "TEST", TEST_SIZE);
    parts.push(`<rect x="${colX}" y="${barY}" width="${colW}" height="${barH}" fill="#000"/>`);
    parts.push(
      `<path fill="#fff" d="${textPath(fonts.bold, "TEST", colX + (colW - textW) / 2, barY + Math.round(TEST_SIZE * 0.82), TEST_SIZE)}"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  return { svg, width: W, height: H, url, qrVersion: qr.version, moduleSize, logoAreaActual, priceSize };
}
