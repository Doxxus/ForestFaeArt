import { logoSvg } from "./logo";
import { buildQr, logoModules, qrPath } from "./qr";
import { fitText, lineHeight, textPath, textWidth, type Font } from "./text";
import {
  DEFAULT_TEMPLATE,
  SCAN_MIN_MODULE_PX,
  SCAN_OK_MODULE_PX,
  formatLabelPrice,
  mmToPx,
  productUrl,
  type LabelAlign,
  type LabelInput,
  type LabelTemplate,
} from "./types";

export interface Fonts {
  regular: Font;
  bold: Font;
}

export type LabelLayout = "side" | "stack" | "qr" | "text";

export interface RenderedLabel {
  svg: string;
  width: number;
  height: number;
  url: string;
  qrVersion: number;
  /** QR dot size in printer dots. 0 when the label has no QR. */
  moduleSize: number;
  logoAreaActual: number;
  /** Price font size in px, 0 when the label has no price. */
  priceSize: number;
  layout: LabelLayout;
  /** Plain-language cautions for the template editor and print screen (LBL-8). Empty when all is well. */
  warnings: string[];
  /** "ok" scans on a B1 as proven, "small" needs a test scan, "tiny" will not scan reliably. */
  scanRisk: "ok" | "small" | "tiny" | "none";
}

const TITLE_SIZES = [30, 28, 26, 24, 22, 20];
// Big enough to read from a distance. Shrinks only if a long price would not fit the column.
const PRICE_SIZES = [48, 44, 40, 36, 32, 28];
const SKU_SIZE = 26;
const TEST_SIZE = 22;

const scaled = (sizes: number[], s: number) => [...new Set(sizes.map((v) => Math.max(8, Math.round(v * s))))];

interface ColumnArgs {
  parts: string[];
  fonts: Fonts;
  input: LabelInput;
  template: LabelTemplate;
  s: number;
  x: number;
  w: number;
  top: number;
  bottom: number;
  /** Draws the SKU under the price (labels with no QR, where the SKU has no other home). */
  skuLine: boolean;
}

const lineX = (align: LabelAlign, x: number, w: number, lineW: number) => (align === "center" ? x + (w - lineW) / 2 : x);

/** Title, then price, then (optionally) the SKU, with the TEST bar pinned to the bottom. Returns the price size. */
function drawColumn(a: ColumnArgs): number {
  const { parts, fonts, input, template, s, x, w, top, bottom } = a;
  const g4 = Math.max(2, Math.round(4 * s));
  const hasPrice = template.show.price && input.priceCents !== null;
  const priceText = hasPrice ? formatLabelPrice(input.priceCents!) : "";
  const priceSizes = scaled(PRICE_SIZES, s);
  const priceSize = hasPrice ? (priceSizes.find((v) => textWidth(fonts.bold, priceText, v) <= w) ?? priceSizes[priceSizes.length - 1]!) : 0;
  const testSize = Math.max(10, Math.round(TEST_SIZE * s));
  const testH = input.isTest ? lineHeight(testSize) + g4 + 2 : 0;
  const priceH = hasPrice ? lineHeight(priceSize) + g4 : 0;
  const skuSize = Math.max(10, Math.round(SKU_SIZE * s));
  const skuH = a.skuLine ? lineHeight(skuSize) + g4 : 0;

  let y = top;
  if (template.show.title) {
    const titleMaxH = bottom - top - priceH - skuH - testH;
    const title = fitText(fonts.bold, input.title, w, titleMaxH, scaled(TITLE_SIZES, s));
    for (const line of title.lines) {
      const baseline = y + Math.round(title.size * 0.82);
      parts.push(`<path fill="#000" d="${textPath(fonts.bold, line, lineX(template.align, x, w, textWidth(fonts.bold, line, title.size)), baseline, title.size)}"/>`);
      y += lineHeight(title.size);
    }
  }

  if (hasPrice) {
    y += g4;
    const baseline = y + Math.round(priceSize * 0.82);
    parts.push(`<path fill="#000" d="${textPath(fonts.bold, priceText, lineX(template.align, x, w, textWidth(fonts.bold, priceText, priceSize)), baseline, priceSize)}"/>`);
    y += lineHeight(priceSize);
  }

  if (a.skuLine) {
    y += g4;
    const baseline = y + Math.round(skuSize * 0.82);
    parts.push(`<path fill="#000" d="${textPath(fonts.bold, input.sku, lineX(template.align, x, w, textWidth(fonts.bold, input.sku, skuSize)), baseline, skuSize)}"/>`);
  }

  if (input.isTest) {
    const barH = lineHeight(testSize);
    const barY = bottom - barH;
    const textW = textWidth(fonts.bold, "TEST", testSize);
    parts.push(`<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="#000"/>`);
    parts.push(`<path fill="#fff" d="${textPath(fonts.bold, "TEST", x + (w - textW) / 2, barY + Math.round(testSize * 0.82), testSize)}"/>`);
  }
  return priceSize;
}

/**
 * Draws one label. The default layout (LBL-11): QR on the left with the logo in its centre and the SKU underneath,
 * title on the right with the price directly under it. Tall labels stack the same parts. Everything is drawn as paths
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
  const geo = Math.min(W / 320, H / 240);
  const s = geo * template.textScale;
  const g6 = Math.max(2, Math.round(6 * geo));
  const gap = Math.round(W * 0.04);

  const url = productUrl(input.baseUrl, input.sku, template.uppercaseUrl);
  const { show } = template;
  const hasText = show.title || (show.price && input.priceCents !== null);
  const layout: LabelLayout = !show.qr ? "text" : !hasText ? "qr" : W / H >= 0.95 ? "side" : "stack";

  const skuSize = Math.max(10, Math.round(SKU_SIZE * s));
  const skuH = show.sku && show.qr ? lineHeight(skuSize) : 0;
  const skuBlock = skuH ? skuH + g6 : 0;
  const blockMaxH = H - 2 * margin;

  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  let priceSize = 0;
  let moduleSize = 0;
  let logoAreaActual = 0;
  let qrVersion = 0;

  if (layout === "text") {
    priceSize = drawColumn({ parts, fonts, input, template, s, x: margin, w: W - 2 * margin, top: margin, bottom: H - margin, skuLine: show.sku });
  } else {
    const qr = buildQr(url);
    qrVersion = qr.version;
    const testBarH = input.isTest && layout === "qr" ? lineHeight(Math.max(10, Math.round(TEST_SIZE * s))) + g6 : 0;

    let qrMaxPx: number;
    if (layout === "side") qrMaxPx = Math.min(blockMaxH - skuBlock, Math.round(W * 0.55));
    else if (layout === "stack") qrMaxPx = Math.min(W - 2 * margin, Math.round(H * 0.5));
    else qrMaxPx = Math.min(W - 2 * margin, blockMaxH - skuBlock - testBarH);
    moduleSize = Math.max(1, Math.floor(qrMaxPx / qr.size));
    const qrPx = moduleSize * qr.size;

    const blockH = qrPx + skuBlock;
    // Side labels centre the QR block in the height. Stacked labels hang it from the top. QR-only labels centre it both ways.
    const qrX = layout === "side" ? margin : margin + Math.round((W - 2 * margin - qrPx) / 2);
    const qrY = layout === "stack" ? margin : margin + Math.round((blockMaxH - testBarH - blockH) / 2);

    const logoSide = logoModules(qr.size, template.logoAreaRatio);
    logoAreaActual = logoSide ? (logoSide * logoSide) / (qr.size * qr.size) : 0;
    parts.push(`<path fill="#000" shape-rendering="crispEdges" d="${qrPath(qr, moduleSize, qrX, qrY, logoSide)}"/>`);
    if (logoSide) {
      const start = Math.floor((qr.size - logoSide) / 2);
      const logoPx = logoSide * moduleSize;
      const inset = Math.round(moduleSize * 0.5);
      parts.push(logoSvg(qrX + start * moduleSize + inset, qrY + start * moduleSize + inset, logoPx - 2 * inset));
    }

    if (skuH) {
      const skuWidth = textWidth(fonts.bold, input.sku, skuSize);
      const skuX = qrX + (qrPx - skuWidth) / 2;
      const skuBaseline = qrY + qrPx + g6 + Math.round(skuSize * 0.82);
      parts.push(`<path fill="#000" d="${textPath(fonts.bold, input.sku, skuX, skuBaseline, skuSize)}"/>`);
    }

    if (layout === "side") {
      const colX = qrX + qrPx + gap;
      priceSize = drawColumn({ parts, fonts, input, template, s, x: colX, w: W - margin - colX, top: margin, bottom: H - margin, skuLine: false });
    } else if (layout === "stack") {
      const top = qrY + qrPx + skuBlock + Math.max(g6, Math.round(gap / 2));
      priceSize = drawColumn({ parts, fonts, input, template, s, x: margin, w: W - 2 * margin, top, bottom: H - margin, skuLine: false });
    } else if (input.isTest) {
      const size = Math.max(10, Math.round(TEST_SIZE * s));
      const barH = lineHeight(size);
      const barW = W - 2 * margin;
      const textW = textWidth(fonts.bold, "TEST", size);
      const barY = H - margin - barH;
      parts.push(`<rect x="${margin}" y="${barY}" width="${barW}" height="${barH}" fill="#000"/>`);
      parts.push(`<path fill="#fff" d="${textPath(fonts.bold, "TEST", margin + (barW - textW) / 2, barY + Math.round(size * 0.82), size)}"/>`);
    }
  }

  const warnings: string[] = [];
  let scanRisk: RenderedLabel["scanRisk"] = "none";
  if (layout !== "text") {
    const mm = (moduleSize / template.dpi) * 25.4;
    scanRisk = moduleSize >= SCAN_OK_MODULE_PX ? "ok" : moduleSize >= SCAN_MIN_MODULE_PX ? "small" : "tiny";
    if (scanRisk === "tiny") warnings.push(`The QR dots are only ${mm.toFixed(2)} mm, too small to scan reliably. Use a bigger label, hide the title and price, or turn on the upper-case web address.`);
    else if (scanRisk === "small") warnings.push(`The QR dots are ${mm.toFixed(2)} mm. They can scan, but print one and test it with a phone before printing a batch.`);
  }
  if (show.qr && !show.sku && layout === "side") warnings.push("The SKU is hidden, so a damaged QR cannot be looked up by hand.");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  return { svg, width: W, height: H, url, qrVersion, moduleSize, logoAreaActual, priceSize, layout, warnings, scanRisk };
}
