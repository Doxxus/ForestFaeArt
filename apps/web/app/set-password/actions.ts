"use server";

import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/api";
import { flash } from "@/lib/format";
import { serverApi } from "@/lib/session";

export async function setPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (message: string): never => redirect(`/set-password?token=${encodeURIComponent(token)}&${flash("error", message)}`);

  if (password !== confirm) back("The two passwords don't match.");

  let failure: string | null = null;
  try {
    await (await serverApi()).auth.setPassword.mutate({ token, password });
  } catch (error) {
    failure = friendlyError(error);
  }
  if (failure) back(failure);
  redirect(`/login?${flash("saved", "Your password is set. Please sign in.")}`);
}
