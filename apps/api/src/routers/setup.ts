import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SETUP_STEP_KEYS } from "@ffa/validators";
import { SAMPLE_ART } from "../media/sample-art.generated";
import { loadSampleData, removeSampleData } from "../services/samples";
import { dismissSetup, finishSetup, loadSetup, recordStep, restartSetup, type SetupError } from "../services/setup";
import { adminProcedure, router } from "../trpc";

const refuse = (e: { code: string; message: string }): never => {
  throw new TRPCError({ code: e.code === "CONFLICT" ? "CONFLICT" : "BAD_REQUEST", message: e.message });
};
const unwrap = <T extends object>(result: T | SetupError): T => ("ok" in result && result.ok === false ? refuse(result as SetupError) : (result as T));

/** The Setup Wizard and Sample Data Mode (SET-1 to SET-8, SAMP-1 to SAMP-4). The administrator's tools only. */
export const setupRouter = router({
  get: adminProcedure.query(({ ctx }) => loadSetup(ctx.db)),

  markStep: adminProcedure.input(z.object({ step: z.enum(SETUP_STEP_KEYS), how: z.enum(["done", "skipped"]) })).mutation(async ({ ctx, input }) => unwrap(await recordStep(ctx.db, ctx.user.id, input.step, input.how))),

  finish: adminProcedure.mutation(async ({ ctx }) => unwrap(await finishSetup(ctx.db, ctx.user.id))),

  dismiss: adminProcedure.mutation(async ({ ctx }) => unwrap(await dismissSetup(ctx.db, ctx.user.id))),

  restart: adminProcedure.mutation(async ({ ctx }) => unwrap(await restartSetup(ctx.db, ctx.user.id))),

  loadSamples: adminProcedure.mutation(async ({ ctx }) => {
    const result = await loadSampleData(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: ctx.source }, { art: SAMPLE_ART });
    if (!result.ok) refuse(result);
    return result;
  }),

  removeSamples: adminProcedure.mutation(({ ctx }) => removeSampleData(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: ctx.source }, ctx.env.MEDIA)),
});
