"use server";

import { settle } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

export interface RecordPrintInput {
  items: { productId: string; copies: number; title: string; priceCents: number }[];
  templateId: string | null;
  format: string;
  printer: "PDF" | "PNG" | "NIIMBOT_B1" | "A4";
}

export type RecordPrintResult = { ok: true; labels: number; isTest: boolean } | { ok: false; message: string };

/** Remembers what was printed, so a later title or price change flags the label as out of date. The browser never holds the session token. */
export async function recordPrintAction(input: RecordPrintInput): Promise<RecordPrintResult> {
  await requireUser();
  const result = await settle(async () => (await serverApi()).labels.record.mutate(input));
  return result.ok ? { ok: true, labels: result.value.labels, isTest: result.value.isTest } : result;
}
