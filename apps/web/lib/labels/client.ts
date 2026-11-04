/** Browser-only helpers for making labels: draw with the engine, turn the drawing into pure black and white, and hand files to the person. */
import type { Fonts, LabelInput, LabelTemplate, RenderedLabel } from "@ffa/label-engine";
import type { LabelTemplateBody } from "@ffa/validators";
import boldFontUrl from "@ffa/label-engine/fonts/BarlowCondensed-SemiBold.ttf?url";
import regularFontUrl from "@ffa/label-engine/fonts/BarlowCondensed-Medium.ttf?url";
import { zip } from "@/lib/zip";

/** The engine (QR, fonts and PDF code) is loaded on demand so it never weighs on pages that do not print. */
export const engine = () => import("@ffa/label-engine");

let fonts: Promise<Fonts> | null = null;

export function loadFonts(): Promise<Fonts> {
  fonts ??= (async () => {
    const { parseFont } = await engine();
    const [regular, bold] = await Promise.all(
      [regularFontUrl, boldFontUrl].map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("The label font could not be loaded.");
        return parseFont(await res.arrayBuffer());
      }),
    );
    return { regular: regular!, bold: bold! };
  })().catch((e) => {
    fonts = null;
    throw e;
  });
  return fonts;
}

export const DPI = 203;

/** The template the API stores, in the shape the engine draws. */
export function toEngineTemplate(t: LabelTemplateBody): LabelTemplate {
  return { name: t.name, widthMm: t.widthMm, heightMm: t.heightMm, dpi: DPI, marginMm: t.marginMm, logoAreaRatio: t.logoAreaRatio, uppercaseUrl: t.uppercaseUrl, show: t.show, align: t.align, textScale: t.textScale };
}

export async function renderLabel(input: LabelInput, template: LabelTemplateBody): Promise<RenderedLabel> {
  const [{ renderLabelSvg }, f] = await Promise.all([engine(), loadFonts()]);
  return renderLabelSvg(input, f, toEngineTemplate(template));
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Draws the SVG at `scale` times its size, then makes every pixel pure black or pure white, which is what a thermal printer prints. */
export async function svgToBlackWhiteCanvas(svg: string, width: number, height: number, scale = 1): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = svgDataUrl(svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    const v = lum < 128 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The label picture could not be made.");
  return new Uint8Array(await blob.arrayBuffer());
}

export interface FileOut {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export const makeZip = (files: FileOut[]): FileOut => ({ name: "labels.zip", type: "application/zip", bytes: zip(files.map((f) => ({ name: f.name, bytes: f.bytes }))) });

const asBlob = (f: FileOut) => new Blob([f.bytes as BlobPart], { type: f.type });

/** Saves a file through the browser's download. */
export function downloadFile(f: FileOut): void {
  const url = URL.createObjectURL(asBlob(f));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const canShareFiles = (files: FileOut[]): boolean => {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  return navigator.canShare({ files: files.map((f) => new File([asBlob(f)], f.name, { type: f.type })) });
};

/** Opens the phone's share sheet so the images go straight to the NIIMBOT app. Must be called from a tap. */
export async function shareFiles(files: FileOut[]): Promise<void> {
  await navigator.share({ files: files.map((f) => new File([asBlob(f)], f.name, { type: f.type })), title: "Labels" });
}

/** A file-name-safe version of a SKU or title. */
export const safeName = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "label";
