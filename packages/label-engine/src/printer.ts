import type { LabelInput, LabelTemplate } from "./types";
import type { RenderedLabel } from "./svg";

/**
 * Printer-agnostic design (LBL-5). A renderer turns a piece and a template into artwork. A printer turns artwork into
 * something physical or downloadable. No vendor is built into either, so a different printer is one new adapter.
 *
 * Adapters live where the platform lives: PNG and PDF export and the NIIMBOT B1 Bluetooth adapter are in the web app,
 * because they need the browser (canvas, Web Bluetooth).
 */
export interface LabelRenderer {
  render(input: LabelInput, template: LabelTemplate): RenderedLabel;
}

/** One distinct label and how many copies of it to print. */
export interface LabelJob {
  /** Stable key such as the SKU plus a hash of what is printed on it. */
  key: string;
  input: LabelInput;
  copies: number;
}

export interface PrintOutcome {
  /** A file the person can save or share (PNG, PDF), or nothing when the printer took the job directly. */
  files: { name: string; type: string; bytes: Uint8Array }[];
  /** Labels sent to the printer or put in the files, counting copies. */
  labels: number;
}

export interface LabelPrinter {
  /** Matches the `printer` column of the print record. */
  readonly kind: "PDF" | "PNG" | "NIIMBOT_B1" | "A4";
  readonly name: string;
  print(jobs: LabelJob[], template: LabelTemplate): Promise<PrintOutcome>;
}
