import { z } from "zod";
import { LABEL_LIMITS, LABEL_PRINTERS, labelTemplateBodySchema } from "@ffa/validators";
import { serviceError } from "../errors";
import {
  createTemplate,
  duplicateTemplate,
  labelCounts,
  listTemplates,
  loadLabelContext,
  prepareLabels,
  printHistory,
  recordPrints,
  setDefaultTemplate,
  setTemplateActive,
  updateTemplate,
} from "../services/labels";
import { adminProcedure, router, staffProcedure } from "../trpc";

const id = z.string().min(1).max(40);

const selection = z.discriminatedUnion("source", [
  z.object({ source: z.literal("ids"), productIds: z.array(id).min(1).max(LABEL_LIMITS.maxProductsPerPrint) }),
  z.object({ source: z.literal("category"), categoryId: id }),
  z.object({ source: z.literal("event"), eventId: id }),
  z.object({ source: z.literal("unlabelled") }),
  z.object({ source: z.literal("stale") }),
]);

export const labelsRouter = router({
  /** Where the QR codes point, and whether labels made now are tests (LBL-13). */
  context: staffProcedure.query(({ ctx }) => loadLabelContext(ctx.db, ctx.env)),

  templates: router({
    /** Active templates for printing. Administrators can also see archived ones. */
    list: staffProcedure.input(z.object({ includeInactive: z.boolean().default(false) }).default({ includeInactive: false })).query(({ ctx, input }) =>
      listTemplates(ctx.db, { includeInactive: input.includeInactive && ctx.user.role === "ADMIN" }),
    ),
    create: adminProcedure.input(labelTemplateBodySchema).mutation(async ({ ctx, input }) => {
      const result = await createTemplate(ctx.db, ctx.user.id, input);
      if (!result.ok) throw serviceError(result);
      return { id: result.id };
    }),
    update: adminProcedure.input(z.object({ id, body: labelTemplateBodySchema })).mutation(async ({ ctx, input }) => {
      const result = await updateTemplate(ctx.db, ctx.user.id, input.id, input.body);
      if (!result.ok) throw serviceError(result);
      return { ok: true as const };
    }),
    duplicate: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
      const result = await duplicateTemplate(ctx.db, ctx.user.id, input.id);
      if (!result.ok) throw serviceError(result);
      return { id: result.id };
    }),
    setDefault: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
      const result = await setDefaultTemplate(ctx.db, ctx.user.id, input.id);
      if (!result.ok) throw serviceError(result);
      return { ok: true as const };
    }),
    setActive: adminProcedure.input(z.object({ id, active: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await setTemplateActive(ctx.db, ctx.user.id, input.id, input.active);
      if (!result.ok) throw serviceError(result);
      return { ok: true as const };
    }),
  }),

  /** The pieces for a selection (chosen pieces, a category, an event, all unlabelled, or all out of date), fresh from the database. */
  prepare: staffProcedure.input(selection).query(async ({ ctx, input }) => {
    const label = await loadLabelContext(ctx.db, ctx.env);
    const result = await prepareLabels(ctx.db, label, input);
    if (!result.ok) throw serviceError(result);
    return { items: result.items, truncated: result.truncated, ...label };
  }),

  /** Remembers what was printed so a later title or price change can flag the label as out of date (LBL-4, LBL-12). */
  record: staffProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: id,
              copies: z.number().int().min(LABEL_LIMITS.copies.min).max(LABEL_LIMITS.copies.max),
              title: z.string().max(200),
              priceCents: z.number().int().min(0).max(10_000_000),
            }),
          )
          .min(1)
          .max(LABEL_LIMITS.maxProductsPerPrint),
        templateId: id.nullable(),
        format: z.string().trim().min(1).max(20),
        printer: z.enum(LABEL_PRINTERS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const label = await loadLabelContext(ctx.db, ctx.env);
      const result = await recordPrints(ctx.db, label, ctx.user.id, input);
      if (!result.ok) throw serviceError(result);
      return { recorded: result.recorded, labels: result.labels, isTest: result.isTest };
    }),

  history: staffProcedure.input(z.object({ productId: id })).query(({ ctx, input }) => printHistory(ctx.db, input.productId)),

  /** Pieces never labelled and pieces whose label is out of date, for the dashboard. */
  counts: staffProcedure.query(async ({ ctx }) => labelCounts(ctx.db, await loadLabelContext(ctx.db, ctx.env))),
});
