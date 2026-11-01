import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, decodeQr, fitText, formatLabelPrice, lineHeight, logoModules, productUrl, renderLabelSvg, textPath, textWidth } from "./index";
import type { LabelInput, LabelTemplate } from "./index";
import { dotGain, loadLabelFonts, rasterize, toPng } from "./node";

const fonts = loadLabelFonts();
const base: LabelInput = {
  sku: "FFA-000123",
  title: "Luna Moth Shadowbox",
  priceCents: 14500,
  baseUrl: "https://forestfae.ca",
  isTest: true,
};

const variants: Array<[string, LabelTemplate]> = [
  ["default 12% logo", DEFAULT_TEMPLATE],
  ["no logo", { ...DEFAULT_TEMPLATE, logoAreaRatio: 0 }],
  ["8% logo", { ...DEFAULT_TEMPLATE, logoAreaRatio: 0.08 }],
  ["12% logo, uppercase URL", { ...DEFAULT_TEMPLATE, uppercaseUrl: true }],
];

const titles = [
  "Luna Moth Shadowbox",
  "Stag Beetle",
  "Framed Emerald Swallowtail Butterfly Display With Botanical Border",
  "Pendant",
];

describe("label geometry", () => {
  it("is 320x240 px for 40x30 mm at 203 dpi", () => {
    const label = renderLabelSvg(base, fonts);
    expect([label.width, label.height]).toEqual([320, 240]);
    const bmp = rasterize(label.svg, label.width);
    expect([bmp.width, bmp.height]).toEqual([320, 240]);
  });
  it("uses integer module sizes, so QR edges are crisp", () => {
    const label = renderLabelSvg(base, fonts);
    expect(Number.isInteger(label.moduleSize)).toBe(true);
    expect(label.moduleSize).toBeGreaterThanOrEqual(4);
  });
  it("keeps the logo near 12% of the QR area and centred on an odd module count", () => {
    const label = renderLabelSvg(base, fonts);
    expect(label.logoAreaActual).toBeGreaterThan(0.1);
    expect(label.logoAreaActual).toBeLessThan(0.14);
    expect(logoModules(33, 0.12) % 2).toBe(1);
    expect(logoModules(29, 0.12)).toBe(9);
    expect(logoModules(33, 0)).toBe(0);
  });
  it("encodes the product URL from the base URL setting", () => {
    expect(productUrl("https://forestfae.ca/", "FFA-000123")).toBe("https://forestfae.ca/p/FFA-000123");
    expect(renderLabelSvg(base, fonts).url).toBe("https://forestfae.ca/p/FFA-000123");
  });
});

describe("QR scans after rendering (every variant, with ink spread and loss)", () => {
  // Ink spread (+1) and exact (0) must scan for every variant. Ink loss (-1) shaves a dot off every edge,
  // which the weak jsQR decoder only survives with the larger uppercase-URL modules. Phones decode better,
  // so this is a worst case. The physical print test decides the default (see ADR 004).
  for (const [name, template] of variants) {
    for (const title of titles) {
      const gains = template.uppercaseUrl ? ([-1, 0, 1] as const) : ([0, 1] as const);
      for (const gain of gains) {
        it(`${name} | ${title.slice(0, 24)} | dot gain ${gain}`, () => {
          const label = renderLabelSvg({ ...base, title }, fonts, template);
          const bmp = dotGain(rasterize(label.svg, label.width), gain);
          expect(decodeQr(bmp)).toBe(label.url);
        });
      }
    }
  }
  it("scans with no price and without the TEST stamp", () => {
    const label = renderLabelSvg({ ...base, priceCents: null, isTest: false }, fonts);
    expect(decodeQr(rasterize(label.svg, label.width))).toBe(label.url);
  });
  it("scans for the highest SKU and a long base URL", () => {
    const label = renderLabelSvg({ ...base, sku: "FFA-999999", baseUrl: "https://staging.forestfae.ca" }, fonts);
    expect(decodeQr(rasterize(label.svg, label.width))).toBe(label.url);
  });
});

describe("text layout", () => {
  it("never lets a title line exceed the right-hand column", () => {
    for (const title of titles) {
      const label = renderLabelSvg({ ...base, title }, fonts);
      const bmp = rasterize(label.svg, label.width);
      // Right margin must stay white: no black pixels in the last 8 px columns.
      for (let y = 0; y < bmp.height; y++) {
        for (let x = bmp.width - 8; x < bmp.width; x++) expect(bmp.black[y * bmp.width + x]).toBe(0);
      }
    }
  });
  it("prints the price large, larger than any title, and shrinks only when a long price needs it", () => {
    const normal = renderLabelSvg(base, fonts);
    expect(normal.priceSize).toBe(48);
    const long = renderLabelSvg({ ...base, priceCents: 1_250_000 }, fonts);
    expect(long.priceSize).toBeLessThan(48);
    expect(long.priceSize).toBeGreaterThanOrEqual(28);
    expect(renderLabelSvg({ ...base, priceCents: null }, fonts).priceSize).toBe(0);
    for (const cents of [500, 14500, 28000, 99900, 1_250_000]) {
      const label = renderLabelSvg({ ...base, priceCents: cents }, fonts);
      const bmp = rasterize(label.svg, label.width);
      for (let y = 0; y < bmp.height; y++) {
        for (let x = bmp.width - 8; x < bmp.width; x++) expect(bmp.black[y * bmp.width + x]).toBe(0);
      }
      expect(decodeQr(bmp)).toBe(label.url);
    }
  });
  it("measures text with the real font", () => {
    expect(textWidth(fonts.bold, "FFA-000123", 26)).toBeGreaterThan(50);
  });
  it("never emits broken glyph paths, including the sequences that broke opentype.js (Botanical)", () => {
    const words = ["Botanical", "With Botanical", "Bot", "Luna Moth Shadowbox", "Emerald Swallowtail", "Pendant", "Beetle"];
    for (const font of [fonts.regular, fonts.bold]) {
      for (const size of [20, 22, 24, 26, 28, 30]) {
        for (const w of words) expect(textPath(font, w, 0, 24, size)).not.toMatch(/NaN|Infinity/);
      }
    }
    const label = renderLabelSvg({ ...base, title: "With Botanical" }, fonts);
    expect(label.svg).not.toMatch(/NaN|Infinity/);
  });
  it("shrinks the font instead of splitting a word, and only splits as a last resort", () => {
    const col = 115;
    const fit = fitText(fonts.bold, "Shadowbox", col, 100, [30, 28, 26, 24, 22, 20]);
    expect(fit.lines).toEqual(["Shadowbox"]);
    expect(fit.size).toBeLessThan(30);
    const huge = fitText(fonts.bold, "Pneumonoultramicroscopicsilicovolcano", col, 100, [30, 24, 20]);
    expect(huge.size).toBe(20);
    expect(huge.lines.length).toBeGreaterThan(1);
  });
  it("ends an over-long title with an ellipsis rather than overflowing", () => {
    const fit = fitText(fonts.bold, titles[2]!, 115, 100, [30, 28, 26, 24, 22, 20]);
    expect(fit.lines.length).toBeLessThanOrEqual(Math.floor(100 / lineHeight(fit.size)));
    for (const line of fit.lines) expect(textWidth(fonts.bold, line, fit.size)).toBeLessThanOrEqual(115);
  });
  it("formats prices", () => {
    expect(formatLabelPrice(14500)).toBe("$145");
    expect(formatLabelPrice(1250)).toBe("$12.50");
  });
});

describe("output", () => {
  it("produces a valid 1-bit-style PNG", () => {
    const label = renderLabelSvg(base, fonts);
    const png = toPng(rasterize(label.svg, label.width));
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
  it("contains only black and white pixels", () => {
    const label = renderLabelSvg(base, fonts);
    const bmp = rasterize(label.svg, label.width);
    expect(bmp.black.every((v) => v === 0 || v === 1)).toBe(true);
    expect(bmp.black.some((v) => v === 1)).toBe(true);
  });
});
