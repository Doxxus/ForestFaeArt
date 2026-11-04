import { PDFDocument, rgb, type PDFImage } from "pdf-lib";
import type { SheetOptions, SheetPlan, SheetLine } from "./sheet";

const PT_PER_MM = 72 / 25.4;
const pt = (mm: number) => mm * PT_PER_MM;

export interface PdfImagePlacement {
  /** Pictures with the same key are stored once however many times they are placed (copies). */
  key: string;
  png: Uint8Array;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface PdfPageContent {
  widthMm: number;
  heightMm: number;
  images: PdfImagePlacement[];
  lines?: SheetLine[];
  boxes?: { xMm: number; yMm: number; wMm: number; hMm: number }[];
}

/**
 * Writes the PDF. Pages are sized exactly in millimetres and images are placed at exact size, so printing at 100%
 * scale gives labels of the right size. (The UI tells people never to choose "fit to page".)
 */
export async function buildPdf(pages: PdfPageContent[], title = "Labels"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Forest Fae Folk Art");
  doc.setProducer("Forest Fae Folk Art");
  const embedded = new Map<string, PDFImage>();
  const ink = rgb(0, 0, 0);

  for (const content of pages) {
    const page = doc.addPage([pt(content.widthMm), pt(content.heightMm)]);
    const flipY = (yMm: number, hMm = 0) => pt(content.heightMm - yMm - hMm);
    for (const img of content.images) {
      let image = embedded.get(img.key);
      if (!image) {
        image = await doc.embedPng(img.png);
        embedded.set(img.key, image);
      }
      page.drawImage(image, { x: pt(img.xMm), y: flipY(img.yMm, img.hMm), width: pt(img.wMm), height: pt(img.hMm) });
    }
    for (const b of content.boxes ?? []) {
      page.drawRectangle({ x: pt(b.xMm), y: flipY(b.yMm, b.hMm), width: pt(b.wMm), height: pt(b.hMm), borderColor: ink, borderWidth: 0.25 });
    }
    for (const l of content.lines ?? []) {
      page.drawLine({ start: { x: pt(l.x1), y: flipY(l.y1) }, end: { x: pt(l.x2), y: flipY(l.y2) }, thickness: 0.25, color: ink });
    }
  }
  return doc.save();
}

export interface PdfLabel {
  key: string;
  png: Uint8Array;
}

/** One page per label, each page exactly label-sized (for a printer that takes PDF at the label size). */
export function labelPages(labels: PdfLabel[], widthMm: number, heightMm: number): PdfPageContent[] {
  return labels.map((l) => ({ widthMm, heightMm, images: [{ key: l.key, png: l.png, xMm: 0, yMm: 0, wMm: widthMm, hMm: heightMm }] }));
}

/** Puts the labels onto sheets following a plan from `planSheet`. `labels[i]` is the picture for item i. */
export function sheetPages(plan: SheetPlan, labels: PdfLabel[], labelWmm: number, labelHmm: number, o: Pick<SheetOptions, "pageWidthMm" | "pageHeightMm">): PdfPageContent[] {
  return plan.pages.map((p) => ({
    widthMm: o.pageWidthMm,
    heightMm: o.pageHeightMm,
    images: p.slots.map((s) => ({ key: labels[s.item]!.key, png: labels[s.item]!.png, xMm: s.xMm, yMm: s.yMm, wMm: labelWmm, hMm: labelHmm })),
    lines: p.lines,
    boxes: p.boxes,
  }));
}
