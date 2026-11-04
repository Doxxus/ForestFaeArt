import { redirect } from "next/navigation";
import { errorCode, friendlyError } from "./api";
import { flash } from "./format";

export type Settled<T> = { ok: true; value: T } | { ok: false; message: string };

/** Runs an API call inside a server action. A lost session goes to the sign-in page, other failures become a message. */
export async function settle<T>(fn: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (errorCode(error) === "UNAUTHORIZED") redirect("/login");
    return { ok: false, message: friendlyError(error) };
  }
}

/** Sends the person back to a page with a success or error message. */
export function back(path: string, result: { ok: boolean; message?: string }, saved = "1"): never {
  const sep = path.includes("?") ? "&" : "?";
  return redirect(`${path}${sep}${result.ok ? flash("saved", saved) : flash("error", result.message ?? "Something went wrong.")}`);
}

export const text = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
export const checked = (data: FormData, name: string) => data.get(name) === "on";
