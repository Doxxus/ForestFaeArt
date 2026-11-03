import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_PASSWORD_LENGTH, POS_SESSION_SECONDS, WEB_SESSION_SECONDS, login } from "@ffa/auth";
import { userError } from "../errors";
import { writeAudit } from "../services/audit";
import { RATE_LIMITS, hitRateLimit, type RateLimitRule } from "../services/rate-limit";
import { checkToken, redeemToken } from "../services/users";
import { loginStore } from "../store";
import { publicProcedure, router, staffProcedure, type Context } from "../trpc";

async function limit(ctx: Context, name: string, rule: RateLimitRule) {
  const result = await hitRateLimit(ctx.db, `${name}:${ctx.ip ?? "unknown"}`, rule);
  if (!result.allowed) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
    });
  }
}

const password = z.string().min(1).max(MAX_PASSWORD_LENGTH);
const token = z.string().min(20).max(200);

export const authRouter = router({
  login: publicProcedure
    .input(
      z.object({
        email: z.string().trim().email().max(254),
        password,
        client: z.enum(["web", "pos"]).default("web"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await limit(ctx, "login", RATE_LIMITS.loginPerIp);
      } catch (error) {
        await writeAudit(ctx.db, { userId: null, action: "auth.login.blocked", entityType: "user", ip: ctx.ip });
        throw error;
      }
      const result = await login(loginStore(ctx.db), input, {
        secret: ctx.env.SESSION_SECRET,
        ttlSeconds: input.client === "pos" ? POS_SESSION_SECONDS : WEB_SESSION_SECONDS,
      });
      // The internal reason goes to the audit log only. The client always gets the same message.
      await writeAudit(ctx.db, {
        userId: result.ok ? result.user.id : null,
        action: result.ok ? "auth.login" : "auth.login.failed",
        entityType: "user",
        entityId: result.ok ? result.user.id : null,
        diff: result.ok ? { client: input.client } : { email: input.email.toLowerCase(), reason: result.internalReason, client: input.client },
        ip: ctx.ip,
      });
      if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: result.message });
      return { token: result.token, user: result.user };
    }),

  me: staffProcedure.query(({ ctx }) => ({ id: ctx.user.id, role: ctx.user.role })),

  /** Lets the set-password page show the right wording, or "expired", before the person types anything. */
  tokenStatus: publicProcedure.input(z.object({ token })).query(async ({ ctx, input }) => {
    await limit(ctx, "token", RATE_LIMITS.tokenRedeemPerIp);
    return checkToken(ctx.db, input.token);
  }),

  setPassword: publicProcedure.input(z.object({ token, password })).mutation(async ({ ctx, input }) => {
    await limit(ctx, "token", RATE_LIMITS.tokenRedeemPerIp);
    const result = await redeemToken(ctx.db, input);
    if (!result.ok) throw userError(result);
    return { ok: true as const };
  }),
});
