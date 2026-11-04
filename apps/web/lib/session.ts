import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createApi, errorCode, type Api } from "./api";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./config";

async function internalSecret(): Promise<string | undefined> {
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>).INTERNAL_SECRET;
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** An API client for the current request: carries the session token and the visitor's address. */
export async function serverApi(): Promise<Api> {
  const h = await headers();
  return createApi({
    token: await getSessionToken(),
    clientIp: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    internalSecret: await internalSecret(),
  });
}

/** Stores the session token in a cookie JavaScript cannot read. Only call from a server action or route handler. */
export async function startSession(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  role: "ADMIN" | "STAFF";
  name: string;
  email: string;
}

/** The signed-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!(await getSessionToken())) return null;
  try {
    return await (await serverApi()).auth.me.query();
  } catch (error) {
    if (errorCode(error) === "UNAUTHORIZED") return null;
    throw error;
  }
});

/** For pages that need a signed-in user. Sends everyone else to the sign-in page. */
export async function requireUser(opts: { admin?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (opts.admin && user.role !== "ADMIN") redirect("/admin?denied=1");
  return user;
}

/** Same-origin check for route handlers that change data (CSRF defence in depth, on top of SameSite=Lax). */
export async function assertSameOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return new URL(origin).host === new URL(req.url).host;
}
