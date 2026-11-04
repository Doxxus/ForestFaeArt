"use server";

import { redirect } from "next/navigation";
import { PRODUCT_STATUSES, type ProductStatus } from "@ffa/validators";
import { back, checked, settle, text } from "@/lib/actions";
import { dollarsToCentsInput, flash } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

const listPath = (sku: string) => `/admin/products/${sku}`;

/** A whole-number field. Empty is null, anything else that is not a number is an error message. */
function wholeNumber(raw: string, label: string, scale = 1): number | null | { error: string } {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} should be a number, 0 or more.` };
  return Math.round(n * scale);
}

export async function createProductAction(formData: FormData) {
  const user = await requireUser();
  const title = text(formData, "title");
  const price = dollarsToCentsInput(text(formData, "price") || "0");
  const quantity = Number(text(formData, "quantity") || "1");
  const costRaw = text(formData, "cost");
  const cost = costRaw ? dollarsToCentsInput(costRaw) : undefined;
  const fail = (m: string) => redirect(`/admin/products/new?${flash("error", m)}`);
  if (!title) fail("Please give the piece a title.");
  if (price === null) fail("The price should look like 45 or 45.50.");
  if (!Number.isInteger(quantity) || quantity < 0) fail("Quantity should be a whole number, 0 or more.");
  if (cost === null) fail("The cost should look like 20 or 20.50.");

  const result = await settle(async () =>
    (await serverApi()).products.create.mutate({
      title,
      priceCents: price ?? 0,
      quantity,
      ...(user.role === "ADMIN" && cost !== undefined && cost !== null ? { costCents: cost } : {}),
    }),
  );
  if (!result.ok) fail(result.message);
  else redirect(`${listPath(result.value.sku)}?${flash("saved", "Created. Add photos and details below, then publish when it's ready.")}`);
}

export async function updateProductAction(formData: FormData) {
  const user = await requireUser();
  const sku = text(formData, "sku");
  const productId = text(formData, "productId");
  const here = listPath(sku);
  const fail = (m: string) => redirect(`${here}?${flash("error", m)}`);

  const price = dollarsToCentsInput(text(formData, "price") || "0");
  if (price === null) fail("The price should look like 45 or 45.50.");
  const costRaw = text(formData, "cost");
  const cost = costRaw === "" ? null : dollarsToCentsInput(costRaw);
  if (costRaw !== "" && cost === null) fail("The cost should look like 20 or 20.50.");

  const weight = wholeNumber(text(formData, "weightGrams"), "Weight");
  const length = wholeNumber(text(formData, "lengthCm"), "Length", 10);
  const width = wholeNumber(text(formData, "widthCm"), "Width", 10);
  const height = wholeNumber(text(formData, "heightCm"), "Height", 10);
  for (const v of [weight, length, width, height]) if (v !== null && typeof v === "object") fail(v.error);

  const slug = text(formData, "slug");
  const etsyUrl = text(formData, "etsyUrl");
  const result = await settle(async () =>
    (await serverApi()).products.update.mutate({
      productId,
      title: text(formData, "title"),
      description: String(formData.get("description") ?? ""),
      priceCents: price ?? 0,
      ...(user.role === "ADMIN" ? { costCents: cost } : {}),
      featured: checked(formData, "featured"),
      portfolioVisible: checked(formData, "portfolioVisible"),
      hidePrice: checked(formData, "hidePrice"),
      fragile: checked(formData, "fragile"),
      listedOnEtsy: checked(formData, "listedOnEtsy"),
      etsyUrl: etsyUrl || null,
      weightGrams: weight as number | null,
      lengthMm: length as number | null,
      widthMm: width as number | null,
      heightMm: height as number | null,
      ...(slug && slug !== text(formData, "slugCurrent") ? { slug } : {}),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Saved.");
}

export async function changeStatusAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const to = text(formData, "to");
  if (!PRODUCT_STATUSES.includes(to as ProductStatus)) back(listPath(sku), { ok: false, message: "Please choose a status." });
  const restore = Number(text(formData, "restoreQuantity"));
  const result = await settle(async () =>
    (await serverApi()).products.changeStatus.mutate({
      productId: text(formData, "productId"),
      to: to as ProductStatus,
      reason: text(formData, "reason") || undefined,
      ...(Number.isInteger(restore) && restore > 0 ? { restoreQuantity: restore } : {}),
    }),
  );
  back(listPath(sku), result.ok ? { ok: true } : result, "Status updated.");
}

export async function adjustStockAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const newQuantity = Number(text(formData, "newQuantity"));
  if (!Number.isInteger(newQuantity) || newQuantity < 0) back(listPath(sku), { ok: false, message: "Quantity should be a whole number, 0 or more." });
  const result = await settle(async () =>
    (await serverApi()).products.adjustStock.mutate({ productId: text(formData, "productId"), newQuantity, reason: text(formData, "reason") }),
  );
  back(listPath(sku), result.ok ? { ok: true } : result, "Stock updated.");
}

export async function setCategoriesAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const result = await settle(async () =>
    (await serverApi()).products.setCategories.mutate({
      productId: text(formData, "productId"),
      categoryIds: formData.getAll("categoryId").map(String),
    }),
  );
  back(listPath(sku), result.ok ? { ok: true } : result, "Categories saved.");
}

export async function setMetadataAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const values: Record<string, string | string[] | null> = {};
  for (const key of formData.getAll("fieldKey").map(String)) {
    const kind = text(formData, `kind_${key}`);
    if (kind === "MULTI_SELECT") {
      const picked = formData.getAll(`m_${key}`).map(String);
      const extra = text(formData, `new_${key}`).split(",").map((s) => s.trim()).filter(Boolean);
      values[key] = [...picked, ...extra];
    } else if (kind === "SELECT") {
      values[key] = text(formData, `new_${key}`) || text(formData, `m_${key}`) || null;
    } else {
      values[key] = text(formData, `m_${key}`) || null;
    }
  }
  const result = await settle(async () =>
    (await serverApi()).products.setMetadata.mutate({ productId: text(formData, "productId"), values, addNewChoices: true }),
  );
  back(listPath(sku), result.ok ? { ok: true } : result, "Details saved.");
}

// ---- photos ----

export async function setPrimaryImageAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const result = await settle(async () => (await serverApi()).images.setPrimary.mutate({ productId: text(formData, "productId"), imageId: text(formData, "imageId") }));
  back(listPath(sku), result.ok ? { ok: true } : result, "Main photo changed.");
}

export async function moveImageAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const productId = text(formData, "productId");
  const imageId = text(formData, "imageId");
  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const result = await settle(async () => {
    const api = await serverApi();
    const ids = (await api.images.list.query({ productId })).map((i) => i.id);
    const at = ids.indexOf(imageId);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    await api.images.reorder.mutate({ productId, imageIds: ids });
  });
  back(listPath(sku), result.ok ? { ok: true } : result, "Photo order saved.");
}

export async function setAltTextAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const result = await settle(async () =>
    (await serverApi()).images.setAlt.mutate({ productId: text(formData, "productId"), imageId: text(formData, "imageId"), altText: text(formData, "altText") }),
  );
  back(listPath(sku), result.ok ? { ok: true } : result, "Description saved.");
}

export async function deleteImageAction(formData: FormData) {
  await requireUser();
  const sku = text(formData, "sku");
  const result = await settle(async () => (await serverApi()).images.delete.mutate({ productId: text(formData, "productId"), imageId: text(formData, "imageId") }));
  back(listPath(sku), result.ok ? { ok: true } : result, "Photo removed.");
}
