"use server";

import { back, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";

const page = (id: string) => `/admin/inquiries/${id}`;

export async function replyAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const result = await settle(async () => (await serverApi()).inquiries.reply.mutate({ id, body: String(formData.get("body") ?? "") }));
  if (!result.ok) back(page(id), result);
  else if (result.value.delivery === "SENT") back(page(id), { ok: true }, "Your reply is on its way.");
  else if (result.value.delivery === "PENDING") back(page(id), { ok: true }, "Your reply is saved. It will be sent once email is set up.");
  else back(page(id), { ok: false, message: `Your reply is saved, but it didn't send: ${result.value.error ?? "unknown problem"}. You can try again below.` });
}

export async function retryAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const replyId = text(formData, "replyId");
  const result = await settle(async () => (await serverApi()).inquiries.retry.mutate(replyId ? { replyId } : { inquiryId: id }));
  if (!result.ok) back(page(id), result);
  else if (result.value.ok) back(page(id), { ok: true }, "Sent.");
  else back(page(id), { ok: false, message: `It still didn't send: ${result.value.error}` });
}

export async function inquiryStatusAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const status = text(formData, "status");
  if (status !== "NEW" && status !== "ARCHIVED") back(page(id), { ok: false, message: "Please choose what to do." });
  const result = await settle(async () => (await serverApi()).inquiries.setStatus.mutate({ id, status: status as "NEW" | "ARCHIVED" }));
  back(page(id), result.ok ? { ok: true } : result, status === "ARCHIVED" ? "Archived." : "Moved back to new.");
}
