export interface LabelFields {
  qr: boolean;
  sku: boolean;
  title: boolean;
  price: boolean;
}

export type LabelAlign = "left" | "center";

export interface LabelTemplate {
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  marginMm: number;
  /** Share of the QR area cleared for the centre logo. 0 disables the logo. */
  logoAreaRatio: number;
  /** Upper-case the URL so the QR can use the compact alphanumeric mode (bigger modules). */
  uppercaseUrl: boolean;
  /** Which parts appear (LBL-2). The QR always carries the logo when logoAreaRatio is above 0. */
  show: LabelFields;
  /** How the title and price line up in their column. */
  align: LabelAlign;
  /** Multiplies the title, price and SKU sizes, on top of the automatic scaling to the label size. */
  textScale: number;
}

export const ALL_FIELDS: LabelFields = { qr: true, sku: true, title: true, price: true };

export const DEFAULT_TEMPLATE: LabelTemplate = {
  name: "Default 40x30",
  widthMm: 40,
  heightMm: 30,
  dpi: 203,
  marginMm: 1.5,
  logoAreaRatio: 0.12,
  uppercaseUrl: false,
  show: ALL_FIELDS,
  align: "left",
  textScale: 1,
};

/** Smallest QR dot, in printer dots, that has been proven to scan from a B1 print (ADR 004: 5 dots, 0.63 mm). */
export const SCAN_OK_MODULE_PX = 4;
/** Below this a thermal print loses too much ink at the edges to decode reliably. */
export const SCAN_MIN_MODULE_PX = 3;

export interface LabelInput {
  sku: string;
  title: string;
  /** Integer CAD cents, or null to leave the price off the label. */
  priceCents: number | null;
  /** Base URL such as https://forestfae.ca. The QR encodes `${baseUrl}/p/${sku}`. */
  baseUrl: string;
  /** Marks labels made against a non-production URL (LBL-13). */
  isTest: boolean;
}

export interface Bitmap {
  width: number;
  height: number;
  /** One byte per pixel: 1 = black, 0 = white. */
  black: Uint8Array;
}

export const mmToPx = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4);

export function productUrl(baseUrl: string, sku: string, uppercase = false): string {
  const url = `${baseUrl.replace(/\/+$/, "")}/p/${sku}`;
  return uppercase ? url.toUpperCase() : url;
}

export function formatLabelPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
