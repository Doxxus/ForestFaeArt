import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { DEFAULT_TEMPLATE, decodeQr, renderLabelSvg } from "../src/index";
import type { Bitmap, LabelInput, LabelTemplate } from "../src/index";
import { loadLabelFonts, rasterize, toPng } from "../src/node";

const outDir = fileURLToPath(new URL("../out/test-sheet/", import.meta.url));
mkdirSync(outDir, { recursive: true });
const fonts = loadLabelFonts();

const input: LabelInput = {
  sku: "FFA-000123",
  title: "Luna Moth Shadowbox",
  priceCents: 14500,
  baseUrl: "https://forestfae.ca",
  isTest: true,
};

const variants: Array<{ id: string; note: string; template: LabelTemplate; input?: Partial<LabelInput> }> = [
  { id: "A-lowercase-logo12", note: "Spec URL, logo about 11% of the QR", template: DEFAULT_TEMPLATE },
  { id: "B-lowercase-nologo", note: "Spec URL, no logo (baseline)", template: { ...DEFAULT_TEMPLATE, logoAreaRatio: 0 } },
  { id: "C-lowercase-logo8", note: "Spec URL, smaller logo (8%)", template: { ...DEFAULT_TEMPLATE, logoAreaRatio: 0.08 } },
  { id: "D-uppercase-logo10", note: "Upper-case URL (bigger modules), logo about 10%", template: { ...DEFAULT_TEMPLATE, uppercaseUrl: true } },
  { id: "E-uppercase-nologo", note: "Upper-case URL, no logo (baseline)", template: { ...DEFAULT_TEMPLATE, uppercaseUrl: true, logoAreaRatio: 0 } },
  { id: "F-uppercase-logo14", note: "Upper-case URL, larger logo (about 14%)", template: { ...DEFAULT_TEMPLATE, uppercaseUrl: true, logoAreaRatio: 0.14 } },
  {
    id: "G-long-title",
    note: "Spec URL, very long title (text fitting)",
    template: DEFAULT_TEMPLATE,
    input: { title: "Framed Emerald Swallowtail Butterfly Display With Botanical Border", priceCents: 28000 },
  },
];

const index: string[] = [
  "# QR label test sheet",
  "",
  "Each PNG is 320x240 px = 40x30 mm at 203 dpi. Print at 100% with no scaling or smoothing.",
  "All labels carry the TEST bar. They encode the production URL pattern, so scans open a page that does not exist yet.",
  "",
  "| File | What it tests | Decodes here | Version | Module (mm) | Logo area |",
  "|---|---|---|---|---|---|",
];
const bitmaps: Bitmap[] = [];

for (const v of variants) {
  const label = renderLabelSvg({ ...input, ...v.input }, fonts, v.template);
  const bmp = rasterize(label.svg, label.width);
  const ok = decodeQr(bmp) === label.url;
  bitmaps.push(bmp);
  writeFileSync(`${outDir}${v.id}.png`, toPng(bmp));
  writeFileSync(`${outDir}${v.id}-preview-4x.png`, toPng(bmp, 4));
  writeFileSync(`${outDir}${v.id}.svg`, label.svg);
  const mm = ((label.moduleSize * 25.4) / v.template.dpi).toFixed(2);
  index.push(
    `| ${v.id}.png | ${v.note} | ${ok ? "yes" : "NO"} | ${label.qrVersion} | ${mm} | ${(label.logoAreaActual * 100).toFixed(1)}% |`,
  );
  console.log(`${v.id}: decode ${ok ? "ok" : "FAILED"}, v${label.qrVersion}, module ${mm} mm`);
}

// Contact sheet for a quick look: 2 columns, 16 px gaps.
const cols = 2;
const gap = 16;
const cw = bitmaps[0]!.width;
const ch = bitmaps[0]!.height;
const rows = Math.ceil(bitmaps.length / cols);
const sheet: Bitmap = {
  width: cols * cw + (cols + 1) * gap,
  height: rows * ch + (rows + 1) * gap,
  black: new Uint8Array((cols * cw + (cols + 1) * gap) * (rows * ch + (rows + 1) * gap)),
};
bitmaps.forEach((b, i) => {
  const ox = gap + (i % cols) * (cw + gap);
  const oy = gap + Math.floor(i / cols) * (ch + gap);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) sheet.black[(oy + y) * sheet.width + ox + x] = b.black[y * cw + x]!;
  for (let x = -1; x <= cw; x++) {
    sheet.black[(oy - 1) * sheet.width + ox + x] = 1;
    sheet.black[(oy + ch) * sheet.width + ox + x] = 1;
  }
  for (let y = -1; y <= ch; y++) {
    sheet.black[(oy + y) * sheet.width + ox - 1] = 1;
    sheet.black[(oy + y) * sheet.width + ox + cw] = 1;
  }
});
writeFileSync(`${outDir}contact-sheet.png`, toPng(sheet));
writeFileSync(`${outDir}INDEX.md`, index.join("\n") + "\n");
void PNG;
console.log(`Wrote ${variants.length} labels to ${outDir}`);
