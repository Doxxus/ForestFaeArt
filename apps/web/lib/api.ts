import { TRPCClientError, createTRPCClient, httpLink } from "@trpc/client";
import type { AppRouter } from "@ffa/api-types";
import { API_URL } from "./config";

export interface ApiOptions {
  token?: string;
  /** The visitor's address, forwarded so the API can rate-limit them rather than this Worker. */
  clientIp?: string | null;
  internalSecret?: string;
}

/** A typed API client for use on the server. The session token never reaches the browser's JavaScript. */
export function createApi(opts: ApiOptions = {}) {
  const headers: Record<string, string> = { "x-ffa-client": "admin" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.clientIp && opts.internalSecret) {
    headers["x-ffa-client-ip"] = opts.clientIp;
    headers["x-ffa-internal"] = opts.internalSecret;
  }
  return createTRPCClient<AppRouter>({ links: [httpLink({ url: `${API_URL}/trpc`, headers })] });
}

export type Api = ReturnType<typeof createApi>;

export const isApiError = (e: unknown): e is TRPCClientError<AppRouter> => e instanceof TRPCClientError;
export const errorCode = (e: unknown): string | null => (isApiError(e) ? ((e.data as { code?: string } | undefined)?.code ?? null) : null);

/** A message that is safe and helpful to show a person. */
export function friendlyError(e: unknown): string {
  if (isApiError(e)) {
    const code = errorCode(e);
    if (code === "BAD_REQUEST" && e.message.startsWith("[")) return "Please check the highlighted fields and try again.";
    if (code === "INTERNAL_SERVER_ERROR") return "Something went wrong on our side. Please try again.";
    return e.message;
  }
  return "We couldn't reach the server. Please check your connection and try again.";
}
