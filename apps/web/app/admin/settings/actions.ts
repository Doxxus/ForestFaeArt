"use server";

import { STORE_MODES, type StoreMode } from "@ffa/validators";
import { back, checked, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

const here = "/admin/settings";

export async function updateSettingsAction(formData: FormData) {
  await requireUser({ admin: true });
  const mode = text(formData, "storeMode");
  if (!STORE_MODES.includes(mode as StoreMode)) back(here, { ok: false, message: "Please choose how the shop should work." });
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
      inquiryEmail: text(formData, "inquiryEmail"),
      replyToEmail: text(formData, "replyToEmail"),
      systemFromEmail: text(formData, "systemFromEmail"),
      qrBaseUrl: text(formData, "qrBaseUrl"),
      taxRegistered: checked(formData, "taxRegistered"),
      taxRegistrationNumber: text(formData, "taxRegistrationNumber"),
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
