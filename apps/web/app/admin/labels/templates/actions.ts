"use server";

import { back, settle } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";
import { labelTemplateBodySchema, type LabelTemplateBody } from "@ffa/validators";

const here = "/admin/labels/templates";

export type SaveTemplateResult = { ok: true; id: string } | { ok: false; message: string };

/** Creates a template (id is null) or changes one. The same checks run here as in the editor, and again in the API. */
export async function saveTemplateAction(id: string | null, body: LabelTemplateBody): Promise<SaveTemplateResult> {
  await requireUser({ admin: true });
  const parsed = labelTemplateBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the template." };
  const result = await settle(async () => {
    const api = await serverApi();
    if (id) {
      await api.labels.templates.update.mutate({ id, body: parsed.data });
      return id;
    }
    return (await api.labels.templates.create.mutate(parsed.data)).id;
  });
  return result.ok ? { ok: true, id: result.value } : result;
}

export async function duplicateTemplateAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).labels.templates.duplicate.mutate({ id: String(formData.get("id") ?? "") }));
  back(here, result.ok ? { ok: true } : result, "Copied. The copy is at the bottom of the list.");
}

export async function defaultTemplateAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).labels.templates.setDefault.mutate({ id: String(formData.get("id") ?? "") }));
  back(here, result.ok ? { ok: true } : result, "That is now the default. It applies to labels printed from now on.");
}

export async function archiveTemplateAction(formData: FormData) {
  await requireUser({ admin: true });
  const active = String(formData.get("active") ?? "") === "1";
  const result = await settle(async () => (await serverApi()).labels.templates.setActive.mutate({ id: String(formData.get("id") ?? ""), active }));
  back(here, result.ok ? { ok: true } : result, active ? "Restored." : "Archived. Past print records keep it.");
}
