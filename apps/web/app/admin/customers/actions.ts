"use server";

import { back, checked, settle, text } from "@/lib/actions";
import { requireUser, serverApi } from "@/lib/session";
import { redirect } from "next/navigation";

const fields = (formData: FormData) => ({
  firstName: text(formData, "firstName"),
  lastName: text(formData, "lastName"),
  email: text(formData, "email"),
  phone: text(formData, "phone"),
  notes: text(formData, "notes"),
  marketingConsent: checked(formData, "marketingConsent"),
});

export async function createCustomerAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).customers.create.mutate(fields(formData)));
  if (!result.ok) back("/admin/customers/new", result);
  else redirect(`/admin/customers/${result.value.id}?saved=${encodeURIComponent("Customer added.")}`);
}

export async function updateCustomerAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  const result = await settle(async () => (await serverApi()).customers.update.mutate({ id, fields: fields(formData) }));
  back(`/admin/customers/${id}`, result.ok ? { ok: true } : result, "Customer saved.");
}

export async function anonymizeCustomerAction(formData: FormData) {
  await requireUser({ admin: true });
  const id = text(formData, "id");
  if (text(formData, "confirm").toLowerCase() !== "remove") back(`/admin/customers/${id}`, { ok: false, message: "Type the word remove to confirm." });
  const result = await settle(async () => (await serverApi()).customers.anonymize.mutate({ id }));
  back(`/admin/customers/${id}`, result.ok ? { ok: true } : result, "This customer's personal details were removed.");
}
