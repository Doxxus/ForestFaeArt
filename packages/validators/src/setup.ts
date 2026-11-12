import { z } from "zod";

/** The Setup Wizard's seven steps, in order (SET-1 to SET-8). Step 1 can't be skipped; the others can. */
export const SETUP_STEPS = [
  { key: "business", title: "Your business", skippable: false },
  { key: "brand", title: "Your story and links", skippable: true },
  { key: "store", title: "How the shop works", skippable: true },
  { key: "categories", title: "Categories", skippable: true },
  { key: "product", title: "Your first piece", skippable: true },
  { key: "qr", title: "Labels and QR codes", skippable: true },
  { key: "event", title: "Your first event", skippable: true },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];
export const SETUP_STEP_KEYS = SETUP_STEPS.map((s) => s.key) as unknown as readonly [SetupStepKey, ...SetupStepKey[]];

const stepKey = z.enum(SETUP_STEP_KEYS);

/** Saved in the `setupProgress` setting so the wizard can be left and resumed. */
export const setupProgressSchema = z.object({
  done: z.array(stepKey).max(SETUP_STEPS.length),
  skipped: z.array(stepKey).max(SETUP_STEPS.length),
  /** When the wizard was finished, as a time in milliseconds. */
  finishedAt: z.number().int().positive().nullable(),
  /** When "Not now" was chosen on the dashboard card. A finished or dismissed wizard stops nagging. */
  dismissedAt: z.number().int().positive().nullable(),
});
export type SetupProgress = z.infer<typeof setupProgressSchema>;

export const emptySetupProgress = (): SetupProgress => ({ done: [], skipped: [], finishedAt: null, dismissedAt: null });

export const isSetupStep = (value: unknown): value is SetupStepKey => typeof value === "string" && (SETUP_STEP_KEYS as readonly string[]).includes(value);

export const stepNumber = (key: SetupStepKey): number => SETUP_STEP_KEYS.indexOf(key) + 1;

/** Marks a step done or skipped. Marking it one way takes it out of the other, so a step is never both. */
export function markStep(progress: SetupProgress, key: SetupStepKey, how: "done" | "skipped"): SetupProgress {
  const other = how === "done" ? "skipped" : "done";
  const mine = progress[how].includes(key) ? progress[how] : [...progress[how], key];
  return { ...progress, [how]: mine, [other]: progress[other].filter((k) => k !== key) };
}

/** The first step that has been neither finished nor skipped, or null when every step has been dealt with. */
export function nextStep(progress: SetupProgress): SetupStepKey | null {
  return SETUP_STEP_KEYS.find((k) => !progress.done.includes(k) && !progress.skipped.includes(k)) ?? null;
}

/** Whether the wizard should still offer itself on the dashboard. */
export const setupPending = (progress: SetupProgress): boolean => progress.finishedAt === null && progress.dismissedAt === null;

export const stepsHandled = (progress: SetupProgress): number => SETUP_STEP_KEYS.filter((k) => progress.done.includes(k) || progress.skipped.includes(k)).length;
