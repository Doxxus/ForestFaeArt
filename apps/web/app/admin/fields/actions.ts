"use server";

import { METADATA_FIELD_TYPES, type MetadataFieldType } from "@ffa/validators";
import { back, checked, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

const here = "/admin/fields";
const choices = (raw: string) => raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export async function createFieldAction(formData: FormData) {
  await requireUser({ admin: true });
  const type = text(formData, "type");
  if (!METADATA_FIELD_TYPES.includes(type as MetadataFieldType)) back(here, { ok: false, message: "Please choose what kind of answer this is." });
  const result = await settle(async () =>
    (await serverApi()).metadata.createField.mutate({
      label: text(formData, "label"),
      type: type as MetadataFieldType,
      options: choices(String(formData.get("options") ?? "")),
      helpText: text(formData, "helpText") || undefined,
      isPublic: checked(formData, "isPublic"),
      filterable: checked(formData, "filterable"),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Field added.");
}

export async function updateFieldAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () =>
    (await serverApi()).metadata.updateField.mutate({
      id: text(formData, "id"),
      label: text(formData, "label"),
      options: choices(String(formData.get("options") ?? "")),
      helpText: text(formData, "helpText"),
      isPublic: checked(formData, "isPublic"),
      filterable: checked(formData, "filterable"),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Saved.");
}

export async function moveFieldAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const result = await settle(async () => {
    const api = await serverApi();
    const ids = (await api.metadata.listFields.query({ includeArchived: false })).map((f) => f.id);
    const at = ids.indexOf(id);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    await api.metadata.reorderFields.mutate({ ids });
  });
  back(here, result.ok ? { ok: true } : result, "Order saved.");
}

export async function archiveFieldAction(formData: FormData) {
  await requireUser({ admin: true });
  const archived = text(formData, "archived") === "1";
  const result = await settle(async () => (await serverApi()).metadata.setFieldArchived.mutate({ id: text(formData, "id"), archived }));
  back(here, result.ok ? { ok: true } : result, archived ? "Archived. What was entered is kept in case you bring it back." : "Restored.");
}
