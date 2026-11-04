"use server";

import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/api";
import { serverApi } from "@/lib/session";

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

/** Only ever goes back to a page on this site. */
const safeReturn = (value: string) => (/^\/[^/\\]/.test(value) || value === "/" ? value : "/contact");

export async function sendInquiryAction(formData: FormData) {
  const returnTo = safeReturn(field(formData, "returnTo"));
  const sep = returnTo.includes("?") ? "&" : "?";
  try {
    await (await serverApi()).inquiries.submit.mutate({
      name: field(formData, "name"),
      email: field(formData, "email"),
      message: field(formData, "message"),
      sku: field(formData, "sku") || undefined,
      website: field(formData, "website") || undefined,
      turnstileToken: field(formData, "cf-turnstile-response") || undefined,
    });
  } catch (error) {
    redirect(`${returnTo}${sep}ask=${encodeURIComponent(friendlyError(error).slice(0, 200))}&ok=0#ask`);
  }
  redirect(`${returnTo}${sep}ok=1#ask`);
}
