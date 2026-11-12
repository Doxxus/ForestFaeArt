import { products, sql } from "@ffa/db";
import {
  SETUP_STEPS,
  emptySetupProgress,
  markStep,
  nextStep,
  setupPending,
  stepsHandled,
  type ProductStatus,
  type SetupProgress,
  type SetupStepKey,
} from "@ffa/validators";
import { loadSettings, saveSettings } from "./settings";
import { sampleStatus, type SampleStatus } from "./samples";
import type { Db } from "../store";

export type SetupError = { ok: false; code: "INVALID"; message: string };

export interface DemoPiece {
  id: string;
  sku: string;
  title: string;
  status: ProductStatus;
  isSample: boolean;
}

export interface SetupSummary {
  progress: SetupProgress;
  /** The first step still to do, or null when every step has been dealt with. */
  next: SetupStepKey | null;
  handled: number;
  total: number;
  /** Whether the dashboard should still offer the wizard. */
  pending: boolean;
  samples: SampleStatus;
  showSampleData: boolean;
  /** What exists already, so each step can say so instead of asking again. */
  facts: { categories: number; realPieces: number; realEvents: number; demoPiece: DemoPiece | null };
}

export async function loadSetup(db: Db): Promise<SetupSummary> {
  const [settings, samples, counts, demo] = await Promise.all([
    loadSettings(db),
    sampleStatus(db),
    db.get<{ categories: number; pieces: number; events: number }>(sql`
      SELECT
        (SELECT COUNT(*) FROM category WHERE archived_at IS NULL) AS categories,
        (SELECT COUNT(*) FROM product WHERE is_sample = 0 AND archived_at IS NULL) AS pieces,
        (SELECT COUNT(*) FROM event WHERE is_sample = 0 AND archived_at IS NULL) AS events`),
    db
      .select({ id: products.id, sku: products.sku, title: products.title, status: products.status, isSample: products.isSample })
      .from(products)
      .where(sql`${products.archivedAt} IS NULL AND ${products.status} != 'DRAFT'`)
      .orderBy(sql`(${products.status} = 'AVAILABLE') DESC, ${products.isSample} ASC, ${products.createdAt} ASC`)
      .limit(1)
      .get(),
  ]);
  const progress = settings.setupProgress;
  return {
    progress,
    next: nextStep(progress),
    handled: stepsHandled(progress),
    total: SETUP_STEPS.length,
    pending: setupPending(progress),
    samples,
    showSampleData: settings.showSampleData,
    facts: { categories: counts?.categories ?? 0, realPieces: counts?.pieces ?? 0, realEvents: counts?.events ?? 0, demoPiece: demo ?? null },
  };
}

async function save(db: Db, userId: string, progress: SetupProgress): Promise<SetupProgress | SetupError> {
  const result = await saveSettings(db, userId, { setupProgress: progress });
  return result.ok ? progress : { ok: false, code: "INVALID", message: result.message };
}

/** Marks a step done or skipped. Only the business step can't be skipped (SET-1). */
export async function recordStep(db: Db, userId: string, step: SetupStepKey, how: "done" | "skipped"): Promise<SetupProgress | SetupError> {
  const def = SETUP_STEPS.find((s) => s.key === step)!;
  if (how === "skipped" && !def.skippable) return { ok: false, code: "INVALID", message: "Please fill in your business details. This step can't be skipped." };
  const { setupProgress } = await loadSettings(db);
  return save(db, userId, markStep(setupProgress, step, how));
}

/** Finishes the wizard. Steps not visited count as skipped, but the business step must be done. */
export async function finishSetup(db: Db, userId: string, now = Date.now()): Promise<SetupProgress | SetupError> {
  const { setupProgress } = await loadSettings(db);
  if (!setupProgress.done.includes("business")) return { ok: false, code: "INVALID", message: "Please fill in your business details first." };
  let progress = setupProgress;
  for (const s of SETUP_STEPS) if (!progress.done.includes(s.key) && !progress.skipped.includes(s.key)) progress = markStep(progress, s.key, "skipped");
  return save(db, userId, { ...progress, finishedAt: now });
}

/** "Not now" on the dashboard. The wizard stays available from Settings. */
export async function dismissSetup(db: Db, userId: string, now = Date.now()): Promise<SetupProgress | SetupError> {
  const { setupProgress } = await loadSettings(db);
  return save(db, userId, { ...setupProgress, dismissedAt: now });
}

/** Starts the wizard over, for running it again from Settings (SET-1). Nothing already saved is changed. */
export async function restartSetup(db: Db, userId: string): Promise<SetupProgress | SetupError> {
  return save(db, userId, emptySetupProgress());
}
