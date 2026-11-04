"use server";

import { revalidatePath } from "next/cache";
import { friendlyError, errorCode } from "@/lib/api";
import { requireUser, serverApi } from "@/lib/session";

export type PreviewData = Awaited<ReturnType<Awaited<ReturnType<typeof serverApi>>["import"]["preview"]["mutate"]>>;
export type RunData = Awaited<ReturnType<Awaited<ReturnType<typeof serverApi>>["import"]["run"]["mutate"]>>;
type Outcome<T> = { ok: true; data: T } | { ok: false; message: string; signedOut?: boolean };

async function guarded<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  await requireUser({ admin: true });
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, message: friendlyError(error), signedOut: errorCode(error) === "UNAUTHORIZED" };
  }
}

export async function previewImportAction(csv: string) {
  return guarded(async () => (await serverApi()).import.preview.mutate({ csv }));
}

export async function runImportAction(input: { csv: string; filename: string; existing: "skip" | "update"; createMissing: boolean }) {
  const result = await guarded(async () => (await serverApi()).import.run.mutate(input));
  revalidatePath("/admin/import");
  return result;
}

export async function undoImportAction(batchId: string) {
  const result = await guarded(async () => (await serverApi()).import.undo.mutate({ batchId }));
  revalidatePath("/admin/import");
  return result;
}
