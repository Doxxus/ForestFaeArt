"use server";

import { cookies } from "next/headers";
import { ROLES, type UserRole } from "@ffa/validators";
import { back, settle, text } from "@/lib/actions";
import { LINK_COOKIE } from "@/lib/config";
import { requireUser, serverApi } from "@/lib/session";

const here = "/admin/users";

/** Keeps a one-time link out of the address bar and logs: it is shown on the next page and expires after two minutes. */
async function stashLink(who: string, link: string) {
  (await cookies()).set(LINK_COOKIE, JSON.stringify({ who, link }), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "strict",
    path: here,
    maxAge: 120,
  });
}

export async function inviteUserAction(formData: FormData) {
  await requireUser({ admin: true });
  const role = text(formData, "role");
  if (!ROLES.includes(role as UserRole)) back(here, { ok: false, message: "Please choose a role." });
  const name = text(formData, "name");
  const result = await settle(async () =>
    (await serverApi()).users.invite.mutate({ email: text(formData, "email"), name, role: role as UserRole }),
  );
  if (!result.ok) back(here, result);
  else {
    await stashLink(name, result.value.link);
    back(here, { ok: true }, `${name} is added. Send them the link below so they can choose a password.`);
  }
}

export async function issueLinkAction(formData: FormData) {
  await requireUser({ admin: true });
  const name = text(formData, "name");
  const result = await settle(async () => (await serverApi()).users.issueLink.mutate({ userId: text(formData, "userId") }));
  if (!result.ok) back(here, result);
  else {
    await stashLink(name, result.value.link);
    back(here, { ok: true }, result.value.purpose === "RESET" ? `Password reset link ready for ${name}.` : `New set-password link ready for ${name}.`);
  }
}

export async function updateUserAction(formData: FormData) {
  await requireUser({ admin: true });
  const role = text(formData, "role");
  const active = text(formData, "active");
  const result = await settle(async () =>
    (await serverApi()).users.update.mutate({
      userId: text(formData, "userId"),
      ...(ROLES.includes(role as UserRole) ? { role: role as UserRole } : {}),
      ...(active ? { active: active === "1" } : {}),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Saved.");
}

export async function revokeSessionsAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).users.revokeSessions.mutate({ userId: text(formData, "userId") }));
  back(here, result.ok ? { ok: true } : result, "Signed out everywhere.");
}
