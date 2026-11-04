"use server";

import { redirect } from "next/navigation";
import { errorCode, friendlyError } from "@/lib/api";
import { flash } from "@/lib/format";
import { serverApi, startSession } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(`/login?${flash("error", "Please enter your email and password.")}`);

  let failure: string | null = null;
  try {
    const result = await (await serverApi()).auth.login.mutate({ email, password, client: "web" });
    await startSession(result.token);
  } catch (error) {
    failure = errorCode(error) === "BAD_REQUEST" ? "Please enter a valid email address and your password." : friendlyError(error);
  }
  if (failure) redirect(`/login?${flash("error", failure)}`);
  redirect("/admin");
}
