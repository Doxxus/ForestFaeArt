import { createTRPCClient, httpLink } from "@trpc/client";
import type { AppRouter } from "@ffa/api-types";
import { API_URL, REQUEST_TIMEOUT_MS } from "./config";

/** A fetch that gives up after a while. React Native's fetch waits forever on a dead connection. */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** A typed API client. The `x-ffa-client` header labels stock changes as coming from the POS app. */
export function createApi(token: string | null, timeoutMs = REQUEST_TIMEOUT_MS) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${API_URL}/trpc`,
        headers: () => ({ "x-ffa-client": "pos", ...(token ? { authorization: `Bearer ${token}` } : {}) }),
        fetch: fetchWithTimeout(timeoutMs),
      }),
    ],
  });
}

export type Api = ReturnType<typeof createApi>;

interface ErrorLike {
  message?: string;
  data?: { httpStatus?: number; code?: string } | null;
}

/** A sentence that is safe and useful to show on the screen. */
export function friendlyError(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const status = e.data?.httpStatus;
  if (typeof status !== "number") return "No connection right now.";
  if (status === 400 && e.message?.startsWith("[")) return "Please check what you entered and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return e.message?.trim() || "Something went wrong.";
}

export const isUnauthorized = (error: unknown): boolean => (error as ErrorLike | undefined)?.data?.httpStatus === 401;
