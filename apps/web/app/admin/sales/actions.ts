"use server";

import { back, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

const page = (id: string) => `/admin/sales/${id}`;

export async function voidSaleAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const reason = text(formData, "reason");
  if (!reason) back(page(id), { ok: false, message: "Please say why you are undoing this sale." });
  const result = await settle(async () => (await serverApi()).sales.void.mutate({ saleId: id, reason }));
  back(page(id), result.ok ? { ok: true } : result, "The sale was undone and the pieces are back in stock.");
}

export async function sendReceiptAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const email = text(formData, "email");
  const result = await settle(async () => (await serverApi()).sales.sendReceipt.mutate({ saleId: id, email }));
  if (!result.ok) back(page(id), result);
  else if (result.value.outcome === "SENT") back(page(id), { ok: true }, "Receipt sent.");
  else if (result.value.outcome === "NOT_SET_UP") back(page(id), { ok: false, message: "Email isn't set up yet, so the receipt couldn't be sent." });
  else back(page(id), { ok: false, message: "The receipt didn't send. Please try again." });
}
