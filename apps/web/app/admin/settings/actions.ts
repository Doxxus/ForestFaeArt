"use server";

import { PAYMENT_METHODS, STORE_MODES, type PaymentMethod, type StoreMode } from "@ffa/validators";
import { redirect } from "next/navigation";
import { back, checked, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

const here = "/admin/settings";

export async function updateSettingsAction(formData: FormData) {
  await requireUser({ admin: true });
  const mode = text(formData, "storeMode");
  if (!STORE_MODES.includes(mode as StoreMode)) back(here, { ok: false, message: "Please choose how the shop should work." });
  const methods = formData.getAll("paymentMethods").map(String).filter((m): m is PaymentMethod => PAYMENT_METHODS.includes(m as PaymentMethod));
  if (methods.length === 0) back(here, { ok: false, message: "Please leave at least one payment method turned on." });
  const result = await settle(async () =>
    (await serverApi()).settings.update.mutate({
      storeMode: mode,
      showPrices: checked(formData, "showPrices"),
      showProductsWithoutPhotos: checked(formData, "showProductsWithoutPhotos"),
      showStockCounts: checked(formData, "showStockCounts"),
      showEtsyLinks: checked(formData, "showEtsyLinks"),
      businessName: text(formData, "businessName"),
      tagline: text(formData, "tagline"),
      sourcingStatement: text(formData, "sourcingStatement"),
      instagramUrl: text(formData, "instagramUrl"),
      etsyUrl: text(formData, "etsyUrl"),
      facebookUrl: text(formData, "facebookUrl"),
      publicEmail: text(formData, "publicEmail"),
      businessPhone: text(formData, "businessPhone"),
      inquiryEmail: text(formData, "inquiryEmail"),
      replyToEmail: text(formData, "replyToEmail"),
      systemFromEmail: text(formData, "systemFromEmail"),
      qrBaseUrl: text(formData, "qrBaseUrl"),
      taxRegistered: checked(formData, "taxRegistered"),
      taxRegistrationNumber: text(formData, "taxRegistrationNumber"),
      paymentMethods: methods,
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Settings saved.");
}

export async function setSiteLiveAction(formData: FormData) {
  await requireUser({ admin: true });
  const live = text(formData, "live") === "1";
  const result = await settle(async () => (await serverApi()).settings.update.mutate({ siteLive: live }));
  back(here, result.ok ? { ok: true } : result, live ? "Your website is now live." : "Your website is hidden again (Coming soon).");
}

export async function loadSamplesAction() {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).setup.loadSamples.mutate());
  back(here, result.ok ? { ok: true } : result, "Sample pieces and events added. They are marked Sample, and visitors can't see them unless you choose to show them.");
}

export async function removeSamplesAction() {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).setup.removeSamples.mutate());
  if (!result.ok) back(here, result);
  else {
    const r = result.value;
    const kept = r.keptProducts.length + r.keptEvents.length;
    const removed = `Removed ${r.removedProducts} sample ${r.removedProducts === 1 ? "piece" : "pieces"} and ${r.removedEvents} sample ${r.removedEvents === 1 ? "event" : "events"}${r.removedTestSales ? `, and ${r.removedTestSales} practice ${r.removedTestSales === 1 ? "sale" : "sales"}` : ""}.`;
    const why = kept
      ? ` Kept ${[...r.keptProducts.map((p) => `${p.title} (${p.reason})`), ...r.keptEvents.map((e) => `${e.title} (${e.reason})`)].join("; ")}.`
      : "";
    back(here, { ok: true }, removed + why);
  }
}

export async function setShowSamplesAction(formData: FormData) {
  await requireUser({ admin: true });
  const show = checked(formData, "showSampleData");
  const result = await settle(async () => (await serverApi()).settings.update.mutate({ showSampleData: show }));
  back(here, result.ok ? { ok: true } : result, show ? "Sample pieces and events now show on your website." : "Sample pieces and events are hidden from your website.");
}

export async function restartSetupAction() {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).setup.restart.mutate());
  if (!result.ok) back(here, result);
  redirect("/admin/setup");
}

export async function backupNowAction() {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).data.backupNow.mutate());
  if (!result.ok) back(here, result);
  if (result.ok && !result.value.ok) back(here, { ok: false, message: "The backup didn't work. Please tell your developer." });
  back(here, { ok: true }, "Backed up just now.");
}
