import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_PASSWORD_LENGTH, POS_SESSION_SECONDS, WEB_SESSION_SECONDS, login } from "@ffa/auth";
import { loginStore } from "./store";
import { adminProcedure, publicProcedure, router, staffProcedure } from "./trpc";

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(({ ctx }) => ({ ok: true as const, environment: ctx.env.ENVIRONMENT })),
  }),

  auth: router({
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email().max(254),
          password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
          client: z.enum(["web", "pos"]).default("web"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const result = await login(loginStore(ctx.db), input, {
          secret: ctx.env.SESSION_SECRET,
          ttlSeconds: input.client === "pos" ? POS_SESSION_SECONDS : WEB_SESSION_SECONDS,
        });
        // Structured log for the audit trail. The internal reason is never sent to the client.
        console.log(JSON.stringify({ event: "login", ok: result.ok, reason: result.ok ? null : result.internalReason }));
        if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: result.message });
        return { token: result.token, user: result.user };
      }),

    me: staffProcedure.query(({ ctx }) => ({ id: ctx.user.id, role: ctx.user.role })),
  }),

  admin: router({
    // Placeholder that proves ADMIN-only enforcement end to end. Replaced by real procedures in Phase 1.
    whoCanSeeCost: adminProcedure.query(() => ({ allowed: "ADMIN" as const })),
  }),
});

export type AppRouter = typeof appRouter;
