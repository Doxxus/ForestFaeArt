import { z } from "zod";
import { ROLES } from "@ffa/validators";
import { userError } from "../errors";
import { inviteUser, listUsers, reissueLink, revokeSessions, updateUser } from "../services/users";
import { adminProcedure, router, type Context } from "../trpc";

const linkFor = (ctx: Context, token: string) => `${ctx.env.WEB_ORIGIN}/set-password?token=${encodeURIComponent(token)}`;
const userId = z.string().min(1).max(40);

/**
 * User management is ADMIN only (AUTH-3, AUTH-4). Links are returned to the administrator to pass on, because
 * nothing is emailed to anyone before the handover session.
 */
export const usersRouter = router({
  list: adminProcedure.query(({ ctx }) => listUsers(ctx.db)),

  invite: adminProcedure
    .input(z.object({ email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(120), role: z.enum(ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const result = await inviteUser(ctx.db, ctx.user.id, input);
      if (!result.ok) throw userError(result);
      return { userId: result.userId, link: linkFor(ctx, result.token), expiresAt: result.expiresAt };
    }),

  update: adminProcedure
    .input(z.object({ userId, role: z.enum(ROLES).optional(), active: z.boolean().optional(), name: z.string().trim().min(1).max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { userId: id, ...patch } = input;
      const result = await updateUser(ctx.db, ctx.user.id, id, patch);
      if (!result.ok) throw userError(result);
      return { ok: true as const };
    }),

  /** A new set-password link (no password yet) or a reset link (already has one). */
  issueLink: adminProcedure.input(z.object({ userId })).mutation(async ({ ctx, input }) => {
    const result = await reissueLink(ctx.db, ctx.user.id, input.userId);
    if (!result.ok) throw userError(result);
    return { link: linkFor(ctx, result.token), expiresAt: result.expiresAt, purpose: result.purpose };
  }),

  revokeSessions: adminProcedure.input(z.object({ userId })).mutation(async ({ ctx, input }) => {
    const result = await revokeSessions(ctx.db, ctx.user.id, input.userId);
    if (!result.ok) throw userError(result);
    return { ok: true as const };
  }),
});
