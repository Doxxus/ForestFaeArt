import { createHash } from "node:crypto";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  ALL_FIELDS,
  DEFAULT_TEMPLATE,
  buildPdf,
  decodeQr,
  labelPages,
  labelsFitOnPage,
  planSheet,
  renderLabelSvg,
  sheetGrid,
  sheetPages,
  DEFAULT_SHEET,
} from "./index";
import type { LabelInput, LabelTemplate } from "./index";
import { dotGain, loadLabelFonts, rasterize, toPng } from "./node";

const fonts = loadLabelFonts();
const base: LabelInput = { sku: "FFA-000123", title: "Luna Moth Shadowbox", priceCents: 14500, baseUrl: "https://forestfae.ca", isTest: false };
const hash = (svg: string) => createHash("sha256").update(svg).digest("hex").slice(0, 16);

const tall: LabelTemplate = { ...DEFAULT_TEMPLATE, name: "40x70", widthMm: 40, heightMm: 70 };
const wide: LabelTemplate = { ...DEFAULT_TEMPLATE, name: "50x30", widthMm: 50, heightMm: 30 };
const jewelry: LabelTemplate = {
  ...DEFAULT_TEMPLATE,
  name: "30x15",
  widthMm: 30,
  heightMm: 15,
  marginMm: 1,
  logoAreaRatio: 0,
  uppercaseUrl: true,
  show: { qr: true, sku: false, title: false, price: false },
};

describe("the proven default label is unchanged (ADR 004)", () => {
  // Fingerprints taken before the template model was generalised. If one changes, the layout the B1 print test proved changed.
  const cases: Array<[string, LabelInput, string]> = [
    ["plain", base, "c22fd3ffb66aa549"],
    ["test stamp", { ...base, isTest: true }, "cb45cbd3e9b1842c"],
    ["long title", { ...base, isTest: true, title: "Framed Emerald Swallowtail Butterfly Display With Botanical Border" }, "e17721a18f697e4d"],
    ["no price", { ...base, priceCents: null }, "6f90d293738bf787"],
    ["price with cents", { ...base, priceCents: 1250 }, "11168d26b69b7929"],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => expect(hash(renderLabelSvg(input, fonts).svg)).toBe(expected));
  }
});

describe("layouts for other templates (LBL-2, LBL-11)", () => {
  it("picks a layout from the size and the fields", () => {
    expect(renderLabelSvg(base, fonts).layout).toBe("side");
    expect(renderLabelSvg(base, fonts, wide).layout).toBe("side");
    expect(renderLabelSvg(base, fonts, tall).layout).toBe("stack");
    expect(renderLabelSvg(base, fonts, jewelry).layout).toBe("qr");
    expect(renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, show: { ...ALL_FIELDS, qr: false } }).layout).toBe("text");
    expect(renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, show: { ...ALL_FIELDS, title: false, price: false } }).layout).toBe("qr");
  });
  it("has the right pixel size for each template", () => {
    const px = (t: LabelTemplate) => {
      const l = renderLabelSvg(base, fonts, t);
      return [l.width, l.height];
    };
    expect(px(tall)).toEqual([320, 559]);
    expect(px(wide)).toEqual([400, 240]);
    expect(px(jewelry)).toEqual([240, 120]);
  });
  const titles = ["Luna Moth Shadowbox", "Stag Beetle", "Framed Emerald Swallowtail Butterfly Display With Botanical Border", "Pendant"];
  for (const [name, template] of [["tall 40x70", tall], ["wide 50x30", wide]] as const) {
    for (const title of titles) {
      for (const isTest of [false, true]) {
        it(`${name} | ${title.slice(0, 22)} | test ${isTest}: scans, with ink spread, and stays inside the margins`, () => {
          const label = renderLabelSvg({ ...base, title, isTest }, fonts, template);
          for (const gain of [0, 1] as const) expect(decodeQr(dotGain(rasterize(label.svg, label.width), gain))).toBe(label.url);
          const bmp = rasterize(label.svg, label.width);
          for (let y = 0; y < bmp.height; y++) for (let x = bmp.width - 6; x < bmp.width; x++) expect(bmp.black[y * bmp.width + x]).toBe(0);
          for (let x = 0; x < bmp.width; x++) for (let y = bmp.height - 6; y < bmp.height; y++) expect(bmp.black[y * bmp.width + x]).toBe(0);
        });
      }
    }
  }
  it("hides fields that are switched off", () => {
    const withAll = renderLabelSvg(base, fonts);
    const noPrice = renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, show: { ...ALL_FIELDS, price: false } });
    const noSku = renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, show: { ...ALL_FIELDS, sku: false } });
    expect(noPrice.priceSize).toBe(0);
    expect(noPrice.svg).not.toBe(withAll.svg);
    expect(noSku.svg).not.toBe(withAll.svg);
    expect(noSku.warnings.join(" ")).toMatch(/SKU is hidden/);
  });
  it("draws the title and price with no QR and puts the SKU in as text", () => {
    const label = renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, show: { ...ALL_FIELDS, qr: false } });
    expect(label.moduleSize).toBe(0);
    expect(label.scanRisk).toBe("none");
    const bmp = rasterize(label.svg, label.width);
    expect(bmp.black.some((v) => v === 1)).toBe(true);
    expect(decodeQr(bmp)).toBeNull();
  });
  it("centres text when asked, and scales it with textScale", () => {
    const left = renderLabelSvg(base, fonts);
    const centre = renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, align: "center" });
    expect(centre.svg).not.toBe(left.svg);
    expect(renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, textScale: 0.8 }).priceSize).toBe(38);
    expect(renderLabelSvg(base, fonts, { ...DEFAULT_TEMPLATE, textScale: 1.2 }).priceSize).toBeGreaterThan(48);
  });
  it("stamps TEST on every layout", () => {
    for (const t of [DEFAULT_TEMPLATE, tall, wide, jewelry, { ...DEFAULT_TEMPLATE, show: { ...ALL_FIELDS, qr: false } }]) {
      const test = renderLabelSvg({ ...base, isTest: true }, fonts, t);
      const real = renderLabelSvg(base, fonts, t);
      expect(test.svg).toContain('fill="#fff"');
      expect(test.svg.length).toBeGreaterThan(real.svg.length);
    }
  });
});

describe("scan warnings (LBL-8)", () => {
  it("is quiet for the proven default and the bigger templates", () => {
    for (const t of [DEFAULT_TEMPLATE, tall, wide]) {
      const label = renderLabelSvg(base, fonts, t);
      expect(label.scanRisk).toBe("ok");
      expect(label.warnings).toEqual([]);
    }
  });
  it("warns when the QR dots get small or tiny", () => {
    const small = renderLabelSvg(base, fonts, jewelry);
    expect(["small", "tiny"]).toContain(small.scanRisk);
    expect(small.warnings.length).toBeGreaterThan(0);
    const tiny = renderLabelSvg(base, fonts, { ...jewelry, name: "20x10", widthMm: 20, heightMm: 10, uppercaseUrl: false });
    expect(tiny.scanRisk).toBe("tiny");
    expect(tiny.warnings.join(" ")).toMatch(/too small to scan/);
  });
});

describe("A4 sheets (LBL-10)", () => {
  it("fits 5 x 9 = 45 labels of 40x30 with 5 mm margins, as specified", () => {
    const g = sheetGrid(40, 30, DEFAULT_SHEET);
    expect([g.cols, g.rows, g.perPage]).toEqual([5, 9, 45]);
    expect(labelsFitOnPage(40, 30)).toBe(45);
  });
  it("accounts for gaps and margins", () => {
    expect(sheetGrid(40, 30, { ...DEFAULT_SHEET, gapMm: 3 }).cols).toBe(4);
    expect(sheetGrid(40, 30, { ...DEFAULT_SHEET, marginMm: 10 }).perPage).toBeLessThan(45);
    expect(sheetGrid(300, 30, DEFAULT_SHEET).perPage).toBe(0);
  });
  it("overflows onto extra pages and places every label exactly once", () => {
    const plan = planSheet(100, 40, 30);
    expect(plan.pages.map((p) => p.slots.length)).toEqual([45, 45, 10]);
    const items = plan.pages.flatMap((p) => p.slots.map((s) => s.item));
    expect(items).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(plan.unusedOnLastPage).toBe(35);
  });
  it("positions cells on the grid and keeps them inside the margins", () => {
    const plan = planSheet(45, 40, 30);
    const first = plan.pages[0]!.slots[0]!;
    const last = plan.pages[0]!.slots[44]!;
    expect([first.xMm, first.yMm]).toEqual([5, 5]);
    expect([last.xMm + 40, last.yMm + 30]).toEqual([205, 275]);
  });
  it("skips used cells on the first page only", () => {
    const plan = planSheet(50, 40, 30, { startCell: 12 });
    expect(plan.pages[0]!.slots).toHaveLength(33);
    expect(plan.pages[0]!.slots[0]).toMatchObject({ item: 0, xMm: 5 + 2 * 40, yMm: 5 + 2 * 30 });
    expect(plan.pages[1]!.slots[0]!.xMm).toBe(5);
    expect(plan.pages[1]!.slots).toHaveLength(17);
  });
  it("clamps a start cell past the page and says so", () => {
    const plan = planSheet(3, 40, 30, { startCell: 99 });
    expect(plan.pages[0]!.slots).toHaveLength(1);
    expect(plan.warnings.join(" ")).toMatch(/start position/);
  });
  it("draws crop ticks outside the grid, or a border per label, or nothing", () => {
    const crop = planSheet(10, 40, 30, { marks: "crop" });
    expect(crop.pages[0]!.lines.length).toBeGreaterThan(0);
    for (const l of crop.pages[0]!.lines) {
      for (const v of [l.x1, l.x2]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [l.y1, l.y2]) expect(v).toBeLessThanOrEqual(297);
    }
    expect(planSheet(7, 40, 30, { marks: "border" }).pages[0]!.boxes).toHaveLength(7);
    expect(planSheet(7, 40, 30).pages[0]!.lines).toHaveLength(0);
  });
  it("reports a label that cannot fit", () => {
    const plan = planSheet(1, 250, 30);
    expect(plan.pages).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/too big/);
  });
});

describe("PDF output", () => {
  const pngFor = (input: LabelInput, template = DEFAULT_TEMPLATE) => {
    const label = renderLabelSvg(input, fonts, template);
    return { label, png: toPng(rasterize(label.svg, label.width * 3)) };
  };

  it("makes label-sized pages at exact size", async () => {
    const a = pngFor(base);
    const bytes = await buildPdf(labelPages([{ key: "a", png: a.png }, { key: "b", png: a.png }], 40, 30));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo((40 * 72) / 25.4, 1);
    expect(height).toBeCloseTo((30 * 72) / 25.4, 1);
  });

  it("makes A4 pages at 595 x 842 pt and stores a repeated label once", async () => {
    const a = pngFor(base);
    const b = pngFor({ ...base, sku: "FFA-000124", title: "Stag Beetle" });
    const items = [...Array(30).fill(0), ...Array(30).fill(1)];
    const plan = planSheet(items.length, 40, 30, { marks: "crop" });
    const pages = sheetPages(plan, items.map((i) => ({ key: i === 0 ? "a" : "b", png: i === 0 ? a.png : b.png })), 40, 30, DEFAULT_SHEET);
    const doc = await PDFDocument.load(await buildPdf(pages));
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    const images = [...doc.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    expect(images).toHaveLength(2);
  });

  it("keeps a QR that still scans in the 3x picture used for sheets (609 dpi, black and white only)", () => {
    const { label, png } = pngFor(base);
    const decoded = PNG.sync.read(Buffer.from(png));
    expect([decoded.width, decoded.height]).toEqual([label.width * 3, label.height * 3]);
    const black = new Uint8Array(decoded.width * decoded.height);
    for (let i = 0; i < black.length; i++) {
      const v = decoded.data[i * 4]!;
      expect(v === 0 || v === 255).toBe(true);
      black[i] = v === 0 ? 1 : 0;
    }
    expect(decodeQr({ width: decoded.width, height: decoded.height, black })).toBe(label.url);
  });
});
