import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadSettings, saveSettings, toPublicSettings } from "../services/settings";
import { adminProcedure, publicProcedure, router } from "../trpc";

export const settingsRouter = router({
  /** Everything, including business emails and tax settings. ADMIN only (AUTH-4). */
  get: adminProcedure.query(({ ctx }) => loadSettings(ctx.db)),

  update: adminProcedure.input(z.record(z.string(), z.unknown())).mutation(async ({ ctx, input }) => {
    const result = await saveSettings(ctx.db, ctx.user.id, input);
    if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
    return result;
  }),

  /** Only the settings the public site needs (store mode, whether prices show, social links). */
  public: publicProcedure.query(async ({ ctx }) => toPublicSettings(await loadSettings(ctx.db))),
});
