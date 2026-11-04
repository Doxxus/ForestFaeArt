"use server";

import { redirect } from "next/navigation";
import { endSession } from "@/lib/session";

export async function signOutAction() {
  await endSession();
  redirect("/login");
}
