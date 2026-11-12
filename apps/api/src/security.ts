import type { Env } from "./env";

/**
 * Headers every API response should carry. They are added only where the route has not set its own,
 * so the sample picture route keeps its stricter sandbox policy.
 */
export function withSecurityHeaders(res: Response, env: Pick<Env, "ENVIRONMENT">): Response {
  const defaults: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    // The API only ever sends data and pictures. Nothing it returns should be able to run as a page.
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  };
  if (env.ENVIRONMENT !== "local") defaults["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  const headers = new Headers(res.headers);
  let changed = false;
  for (const [name, value] of Object.entries(defaults)) {
    if (!headers.has(name)) {
      headers.set(name, value);
      changed = true;
    }
  }
  return changed ? new Response(res.body, { status: res.status, statusText: res.statusText, headers }) : res;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short code a person can read out over the phone ("ref K7M2QX4P"). It carries no information, it just finds the log line. */
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const references = new WeakMap<object, string>();

/** The same reference for the same error, so the log line and the message shown to the person match. */
export function referenceFor(error: object): string {
  let ref = references.get(error);
  if (!ref) {
    ref = newReference();
    references.set(error, ref);
  }
  return ref;
}
