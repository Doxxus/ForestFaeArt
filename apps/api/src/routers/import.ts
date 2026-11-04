import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { IMPORT_MAX_BYTES, IMPORT_TEMPLATE_CSV } from "@ffa/validators";
import { inventoryError } from "../errors";
import { applyImport, listImportBatches, previewImport, undoImport } from "../services/import";
import { adminProcedure, router } from "../trpc";

const csv = z.string().max(IMPORT_MAX_BYTES);

/** Importing and undoing an import are ADMIN only (Settings > Import). */
export const importRouter = router({
  template: adminProcedure.query(() => ({ filename: "inventory_import_template.csv", csv: IMPORT_TEMPLATE_CSV })),

  /** Dry run: nothing is written. */
  preview: adminProcedure.input(z.object({ csv })).mutation(({ ctx, input }) => previewImport(ctx.db, input.csv)),

  /** Imports for real. Named `run` because tRPC reserves `apply`. */
  run: adminProcedure
    .input(
      z.object({
        csv,
        filename: z.string().trim().min(1).max(200).default("import.csv"),
        existing: z.enum(["skip", "update"]).default("skip"),
        createMissing: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { csv: text, ...opts } = input;
      const result = await applyImport(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: "IMPORT" }, text, opts);
      if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      return result.result;
    }),

  batches: adminProcedure.query(({ ctx }) => listImportBatches(ctx.db)),

  undo: adminProcedure.input(z.object({ batchId: z.string().min(1).max(40) })).mutation(async ({ ctx, input }) => {
    const result = await undoImport(ctx.db, { id: ctx.user.id, role: ctx.user.role, source: "IMPORT" }, input.batchId);
    if (result.ok) return { archived: result.archived };
    if ("code" in result && (result.code === "NOT_FOUND" || result.code === "CONFLICT" || result.code === "INVALID")) {
      throw new TRPCError({ code: result.code === "NOT_FOUND" ? "NOT_FOUND" : result.code === "CONFLICT" ? "CONFLICT" : "BAD_REQUEST", message: result.message });
    }
    throw inventoryError(result as Parameters<typeof inventoryError>[0]);
  }),
});
