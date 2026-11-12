"use server";

import { redirect } from "next/navigation";
import { endSession, requireUser, serverApi } from "@/lib/session";
import { settle } from "@/lib/actions";

export async function signOutAction() {
  await endSession();
  redirect("/login");
}

/** "Not now" on the dashboard's setup card. The wizard stays available from Settings. */
export async function dismissSetupAction() {
  await requireUser({ admin: true });
  await settle(async () => (await serverApi()).setup.dismiss.mutate());
  redirect("/admin");
}
