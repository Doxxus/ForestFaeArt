import { TRPCError, initTRPC } from "@trpc/server";
import { authorize, verifySessionToken, ROLES, type Role, type SessionClaims } from "@ffa/auth";
import type { Env } from "./env";
import { emailProviderFor, type EmailProvider } from "./email/provider";
import { referenceFor } from "./security";
import { loadUserRecord, makeDb, type Db } from "./store";
import { verifyTurnstile } from "./turnstile";

export interface Context {
  env: Env;
  db: Db;
  /** Client IP as seen by Cloudflare. Null in local development. */
  ip: string | null;
  /** Which app is calling, from the x-ffa-client header. Only used to label inventory history. */
  source: "ADMIN" | "POS";
  /** Verified lazily so public procedures never pay for it. */
  claims: () => Promise<SessionClaims | null>;
  /** Null until an email provider is set up. */
  email: EmailProvider | null;
  /** The "are you a person" check for public forms. Passes when Turnstile isn't configured. */
  verifyHuman: (token: string | undefined) => Promise<boolean>;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The client address for rate limiting. Requests from our own web Worker arrive from Cloudflare, not from the visitor,
 * so the web app forwards the visitor's address in x-ffa-client-ip. That header is believed only when the request also
 * carries the shared INTERNAL_SECRET, so nobody else can choose their own address.
 */
function clientIp(env: Env, req: Request): string | null {
  const forwarded = req.headers.get("x-ffa-client-ip");
  const secret = req.headers.get("x-ffa-internal");
  if (forwarded && secret && env.INTERNAL_SECRET && timingSafeEqual(secret, env.INTERNAL_SECRET)) return forwarded.slice(0, 64);
  return req.headers.get("cf-connecting-ip");
}

export function createContext(env: Env, req: Request, overrides: Partial<Pick<Context, "email" | "verifyHuman">> = {}): Context {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  let cached: Promise<SessionClaims | null> | undefined;
  const ip = clientIp(env, req);
  return {
    env,
    db: makeDb(env.DB),
    ip,
    source: req.headers.get("x-ffa-client") === "pos" ? "POS" : "ADMIN",
    claims: () => (cached ??= token ? verifySessionToken(token, env.SESSION_SECRET) : Promise.resolve(null)),
    email: "email" in overrides ? (overrides.email ?? null) : emailProviderFor(env),
    verifyHuman: overrides.verifyHuman ?? (async (t) => (env.TURNSTILE_SECRET ? verifyTurnstile(env.TURNSTILE_SECRET, t, ip) : true)),
  };
}

// isDev: false keeps stack traces out of responses. tRPC otherwise decides from NODE_ENV, which Workers don't set.
// An unexpected failure gets a short reference (ADR 016): the person sees it, and the same code is in the log line.
const t = initTRPC.context<Context>().create({
  isDev: false,
  errorFormatter({ shape, error }) {
    if (error.code !== "INTERNAL_SERVER_ERROR") return { ...shape, data: { ...shape.data, reference: undefined } };
    // The real message (a database error, say) goes in the log under this reference, never to the caller.
    return { ...shape, message: "Something went wrong on our side.", data: { ...shape.data, reference: referenceFor(error) } };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** The signed-in user for a public procedure that behaves differently for staff (for example previewing an unpublished site). */
export async function optionalUser(ctx: Context) {
  const claims = await ctx.claims();
  const user = claims ? await loadUserRecord(ctx.db, claims.userId) : null;
  const result = authorize(claims, user, ROLES.anyUser);
  return result.ok ? result.user : null;
}

function requireRoles(allowed: readonly Role[]) {
  return t.middleware(async ({ ctx, next }) => {
    const claims = await ctx.claims();
    const user = claims ? await loadUserRecord(ctx.db, claims.userId) : null;
    const result = authorize(claims, user, allowed);
    if (!result.ok) {
      if (result.reason === "FORBIDDEN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to do that." });
      }
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
    }
    return next({ ctx: { ...ctx, user: result.user } });
  });
}

/** ADMIN or STAFF. */
export const staffProcedure = t.procedure.use(requireRoles(ROLES.anyUser));
/** ADMIN only. */
export const adminProcedure = t.procedure.use(requireRoles(ROLES.adminOnly));
