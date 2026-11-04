"use server";

import { back, checked, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

const here = "/admin/categories";

export async function createCategoryAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () =>
    (await serverApi()).categories.create.mutate({ name: text(formData, "name"), description: text(formData, "description") || undefined }),
  );
  back(here, result.ok ? { ok: true } : result, "Category added.");
}

export async function updateCategoryAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () =>
    (await serverApi()).categories.update.mutate({
      id: text(formData, "id"),
      name: text(formData, "name"),
      description: text(formData, "description"),
      hidden: checked(formData, "hidden"),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Saved.");
}

export async function moveCategoryAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const result = await settle(async () => {
    const api = await serverApi();
    const ids = (await api.categories.list.query({ includeArchived: false })).map((c) => c.id);
    const at = ids.indexOf(id);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    await api.categories.reorder.mutate({ ids });
  });
  back(here, result.ok ? { ok: true } : result, "Order saved.");
}

export async function archiveCategoryAction(formData: FormData) {
  await requireUser({ admin: true });
  const archived = text(formData, "archived") === "1";
  const result = await settle(async () => (await serverApi()).categories.setArchived.mutate({ id: text(formData, "id"), archived }));
  if (!result.ok) back(here, result);
  else
    back(
      here,
      { ok: true },
      archived
        ? `Archived. ${result.value.affectedProducts === 0 ? "No pieces were in it." : `The ${result.value.affectedProducts} pieces in it are untouched.`}`
        : "Restored.",
    );
}
