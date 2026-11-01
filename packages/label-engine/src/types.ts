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
}

export const DEFAULT_TEMPLATE: LabelTemplate = {
  name: "Default 40x30",
  widthMm: 40,
  heightMm: 30,
  dpi: 203,
  marginMm: 1.5,
  logoAreaRatio: 0.12,
  uppercaseUrl: false,
};

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
