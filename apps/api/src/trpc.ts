import { TRPCError, initTRPC } from "@trpc/server";
import { authorize, verifySessionToken, ROLES, type Role, type SessionClaims } from "@ffa/auth";
import type { Env } from "./env";
import { loadUserRecord, makeDb, type Db } from "./store";

export interface Context {
  env: Env;
  db: Db;
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
    claims: () => (cached ??= token ? verifySessionToken(token, env.SESSION_SECRET) : Promise.resolve(null)),
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

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
