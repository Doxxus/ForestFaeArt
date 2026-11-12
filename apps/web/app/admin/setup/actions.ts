"use server";

import { STORE_MODES, isSetupStep, type SetupStepKey, type StoreMode } from "@ffa/validators";
import { redirect } from "next/navigation";
import { back, settle, text } from "@/lib/actions";
import { flash } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

const stepPath = (step: SetupStepKey) => `/admin/setup?step=${step}`;

/** The settings each step saves, or a sentence saying what is missing. Only step 1 insists on anything. */
function settingsFor(step: SetupStepKey, form: FormData): Record<string, unknown> | string {
  switch (step) {
    case "business": {
      if (!text(form, "businessName")) return "Please type your business name.";
      return {
        businessName: text(form, "businessName"),
        publicEmail: text(form, "publicEmail"),
        inquiryEmail: text(form, "inquiryEmail"),
        businessPhone: text(form, "businessPhone"),
        qrBaseUrl: text(form, "qrBaseUrl"),
      };
    }
    case "brand":
      return {
        tagline: text(form, "tagline"),
        sourcingStatement: text(form, "sourcingStatement"),
        instagramUrl: text(form, "instagramUrl"),
        etsyUrl: text(form, "etsyUrl"),
        facebookUrl: text(form, "facebookUrl"),
      };
    case "store": {
      const mode = text(form, "storeMode");
      return STORE_MODES.includes(mode as StoreMode) ? { storeMode: mode } : "Please choose how the shop should work.";
    }
    default:
      return {};
  }
}

/** Saves a step (or skips it) and moves on to whatever is next. When nothing is left the wizard finishes. */
export async function saveStepAction(formData: FormData) {
  await requireUser({ admin: true });
  const step = text(formData, "step");
  if (!isSetupStep(step)) redirect("/admin/setup");
  const skipping = text(formData, "intent") === "skip";

  const patch = skipping ? {} : settingsFor(step, formData);
  if (typeof patch === "string") back(stepPath(step), { ok: false, message: patch });

  const saved = await settle(async () => {
    const api = await serverApi();
    if (Object.keys(patch).length) await api.settings.update.mutate(patch);
    await api.setup.markStep.mutate({ step, how: skipping ? "skipped" : "done" });
    return api.setup.get.query();
  });
  if (!saved.ok) back(stepPath(step), saved);
  else if (saved.value.next) redirect(stepPath(saved.value.next));

  const finished = await settle(async () => (await serverApi()).setup.finish.mutate());
  if (!finished.ok) back("/admin/setup", finished);
  redirect(`/admin?${flash("saved", "Setup finished. You can run the wizard again any time from Settings.")}`);
}

export async function addCategoryAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).categories.create.mutate({ name: text(formData, "name") }));
  back(stepPath("categories"), result.ok ? { ok: true } : result, "Category added.");
}

export async function loadSamplesInWizardAction(formData: FormData) {
  await requireUser({ admin: true });
  const step = text(formData, "step");
  const result = await settle(async () => (await serverApi()).setup.loadSamples.mutate());
  back(stepPath(isSetupStep(step) ? step : "product"), result.ok ? { ok: true } : result, "Sample pieces and events added. They are marked Sample, and you can remove them in Settings.");
}
