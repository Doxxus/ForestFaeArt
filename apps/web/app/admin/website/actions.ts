"use server";

import { CONTENT_KEYS } from "./keys";
import { back, checked, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

export async function updateContentAction(formData: FormData) {
  await requireUser({ admin: true });
  const key = text(formData, "key");
  const here = `/admin/website/${key}`;
  if (!(CONTENT_KEYS as readonly string[]).includes(key)) back("/admin/website", { ok: false, message: "That page doesn't exist." });
  const result = await settle(async () =>
    (await serverApi()).content.update.mutate({
      key: key as (typeof CONTENT_KEYS)[number],
      title: text(formData, "title"),
      body: String(formData.get("body") ?? ""),
      isDraft: checked(formData, "isDraft"),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Saved.");
}

export async function removeContentImageAction(formData: FormData) {
  await requireUser({ admin: true });
  const key = text(formData, "key");
  const result = await settle(async () => (await serverApi()).content.removeImage.mutate({ key: key as (typeof CONTENT_KEYS)[number] }));
  back(`/admin/website/${key}`, result.ok ? { ok: true } : result, "Picture removed.");
}
