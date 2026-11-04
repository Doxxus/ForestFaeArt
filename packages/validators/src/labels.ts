import { z } from "zod";

/** The domain real labels point at (QR-6). Anything else, or any non-production environment, makes a TEST label (LBL-13). */
export const PRODUCTION_QR_BASE_URL = "https://forestfae.ca";

const normaliseBase = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

export function isTestLabelContext(environment: "local" | "staging" | "production", qrBaseUrl: string): boolean {
  return environment !== "production" || normaliseBase(qrBaseUrl) !== normaliseBase(PRODUCTION_QR_BASE_URL);
}

/** The NIIMBOT B1 takes labels up to 50 mm wide and prints their middle 48 mm (a 384-dot head at 203 dpi). */
export const B1_MAX_WIDTH_MM = 50;

export const LABEL_LIMITS = {
  sizeMm: { min: 10, max: 200 },
  marginMm: { min: 0, max: 10 },
  textScale: { min: 0.6, max: 1.6 },
  logoAreaRatio: { min: 0, max: 0.2 },
  copies: { min: 1, max: 99 },
  /** Labels (counting copies) in one print, to keep one request and one file a sensible size. */
  maxLabelsPerPrint: 500,
  maxProductsPerPrint: 200,
} as const;

const mm = (min: number, max: number) => z.number().min(min).max(max);

export const labelFieldsSchema = z.object({ qr: z.boolean(), sku: z.boolean(), title: z.boolean(), price: z.boolean() });

/** What the owner edits for a template (LBL-2). Sizes in millimetres. The printer resolution is fixed at 203 dpi. */
export const labelTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1, "Give the template a name.").max(60),
    widthMm: mm(LABEL_LIMITS.sizeMm.min, LABEL_LIMITS.sizeMm.max),
    heightMm: mm(LABEL_LIMITS.sizeMm.min, LABEL_LIMITS.sizeMm.max),
    marginMm: mm(LABEL_LIMITS.marginMm.min, LABEL_LIMITS.marginMm.max),
    logoAreaRatio: mm(LABEL_LIMITS.logoAreaRatio.min, LABEL_LIMITS.logoAreaRatio.max),
    uppercaseUrl: z.boolean(),
    show: labelFieldsSchema,
    align: z.enum(["left", "center"]),
    textScale: mm(LABEL_LIMITS.textScale.min, LABEL_LIMITS.textScale.max),
  })
  .refine((t) => t.show.qr || t.show.sku || t.show.title || t.show.price, { message: "Show at least one thing on the label.", path: ["show"] })
  .refine((t) => 2 * t.marginMm < Math.min(t.widthMm, t.heightMm), { message: "The margins are bigger than the label.", path: ["marginMm"] });

export type LabelTemplateBody = z.infer<typeof labelTemplateBodySchema>;

const ALL = { qr: true, sku: true, title: true, price: true };
const BODY: LabelTemplateBody = { name: "", widthMm: 40, heightMm: 30, marginMm: 1.5, logoAreaRatio: 0.12, uppercaseUrl: false, show: ALL, align: "left", textScale: 1 };

/** Presets shipped with the system (LBL-2). The first is the default. */
export const LABEL_PRESETS: { key: string; body: LabelTemplateBody }[] = [
  { key: "default-40x30", body: { ...BODY, name: "Default 40 x 30 mm" } },
  { key: "large-40x70", body: { ...BODY, name: "Large 40 x 70 mm", heightMm: 70 } },
  { key: "wide-50x30", body: { ...BODY, name: "Wide 50 x 30 mm", widthMm: 50 } },
  {
    key: "jewelry-30x15",
    body: { ...BODY, name: "Jewelry tag 30 x 15 mm (QR only)", widthMm: 30, heightMm: 15, marginMm: 1, logoAreaRatio: 0, uppercaseUrl: true, show: { qr: true, sku: false, title: false, price: false } },
  },
];

/** How a piece's label stands: never printed, printed and still right, or printed but the title or price has changed since (LBL-12). */
export const LABEL_STATES = ["NONE", "CURRENT", "STALE"] as const;
export type LabelState = (typeof LABEL_STATES)[number];

export const LABEL_SOURCES = ["ids", "category", "event", "unlabelled", "stale"] as const;
export type LabelSource = (typeof LABEL_SOURCES)[number];

export const LABEL_OUTPUTS = ["PNG", "PDF", "A4", "NIIMBOT_B1"] as const;

export const sheetOptionsSchema = z.object({
  marginMm: z.number().min(0).max(30),
  gapMm: z.number().min(0).max(20),
  marks: z.enum(["none", "crop", "border"]),
  startCell: z.number().int().min(0).max(999),
});
export type SheetOptionsInput = z.infer<typeof sheetOptionsSchema>;

/** Human-readable size such as "40 x 30 mm". */
export const sizeLabel = (t: { widthMm: number; heightMm: number }) => `${trimZero(t.widthMm)} x ${trimZero(t.heightMm)} mm`;
const trimZero = (n: number) => String(Math.round(n * 100) / 100);
