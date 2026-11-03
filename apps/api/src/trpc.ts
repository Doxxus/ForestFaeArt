import { TRPCError, initTRPC } from "@trpc/server";
import { authorize, verifySessionToken, ROLES, type Role, type SessionClaims } from "@ffa/auth";
import type { Env } from "./env";
import { loadUserRecord, makeDb, type Db } from "./store";

export interface Context {
  env: Env;
  db: Db;
  /** Client IP as seen by Cloudflare. Null in local development. */
  ip: string | null;
  /** Which app is calling, from the x-ffa-client header. Only used to label inventory history. */
  source: "ADMIN" | "POS";
  /** Verified lazily so public procedures never pay for it. */
  claims: () => Promise<SessionClaims | null>;
}

export function createContext(env: Env, req: Request): Context {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  let cached: Promise<SessionClaims | null> | undefined;
  return {
    env,
    db: makeDb(env.DB),
    ip: req.headers.get("cf-connecting-ip"),
    source: req.headers.get("x-ffa-client") === "pos" ? "POS" : "ADMIN",
    claims: () => (cached ??= token ? verifySessionToken(token, env.SESSION_SECRET) : Promise.resolve(null)),
  };
}

// isDev: false keeps stack traces out of responses. tRPC otherwise decides from NODE_ENV, which Workers don't set.
const t = initTRPC.context<Context>().create({ isDev: false });

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
