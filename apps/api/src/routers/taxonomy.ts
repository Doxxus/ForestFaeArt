import { z } from "zod";
import { METADATA_FIELD_TYPES } from "@ffa/validators";
import { serviceError } from "../errors";
import {
  createCategory,
  createMetadataField,
  listCategories,
  listMetadataFields,
  reorderCategories,
  reorderMetadataFields,
  setCategoryArchived,
  setMetadataFieldArchived,
  updateCategory,
  updateMetadataField,
} from "../services/catalogue";
import { adminProcedure, router, staffProcedure } from "../trpc";

const id = z.string().min(1).max(40);
const ids = z.array(id).max(500);
const choices = z.array(z.string().max(80)).max(200);

/** Listing is open to STAFF (they assign categories). Managing them is ADMIN only. */
export const categoriesRouter = router({
  list: staffProcedure.input(z.object({ includeArchived: z.boolean().default(false) }).default({ includeArchived: false })).query(({ ctx, input }) => listCategories(ctx.db, input)),

  create: adminProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await createCategory(ctx.db, ctx.user.id, input);
      if (!result.ok) throw serviceError(result);
      return { id: result.id, slug: result.slug };
    }),

  update: adminProcedure
    .input(z.object({ id, name: z.string().trim().min(1).max(80).optional(), description: z.string().max(1000).optional(), hidden: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id: categoryId, ...patch } = input;
      const result = await updateCategory(ctx.db, ctx.user.id, categoryId, patch);
      if (!result.ok) throw serviceError(result);
      return { ok: true as const };
    }),

  reorder: adminProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => {
    const result = await reorderCategories(ctx.db, ctx.user.id, input.ids);
    if (!result.ok) throw serviceError(result);
    return { ok: true as const };
  }),

  /** Returns how many products were in the category, so the UI can say "3 pieces are in this category" before archiving. */
  setArchived: adminProcedure.input(z.object({ id, archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const result = await setCategoryArchived(ctx.db, ctx.user.id, input.id, input.archived);
    if (!result.ok) throw serviceError(result);
    return { affectedProducts: result.affectedProducts };
  }),
});

export const metadataRouter = router({
  listFields: staffProcedure.input(z.object({ includeArchived: z.boolean().default(false) }).default({ includeArchived: false })).query(({ ctx, input }) => listMetadataFields(ctx.db, input)),

  createField: adminProcedure
    .input(
      z.object({
        label: z.string().trim().min(1).max(80),
        type: z.enum(METADATA_FIELD_TYPES),
        options: choices.optional(),
        helpText: z.string().max(300).optional(),
        required: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        filterable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await createMetadataField(ctx.db, ctx.user.id, input);
      if (!result.ok) throw serviceError(result);
      return { id: result.id, key: result.key };
    }),

  updateField: adminProcedure
    .input(
      z.object({
        id,
        label: z.string().trim().min(1).max(80).optional(),
        options: choices.optional(),
        helpText: z.string().max(300).optional(),
        required: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        filterable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id: fieldId, ...patch } = input;
      const result = await updateMetadataField(ctx.db, ctx.user.id, fieldId, patch);
      if (!result.ok) throw serviceError(result);
      return { ok: true as const };
    }),

  reorderFields: adminProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => {
    const result = await reorderMetadataFields(ctx.db, ctx.user.id, input.ids);
    if (!result.ok) throw serviceError(result);
    return { ok: true as const };
  }),

  setFieldArchived: adminProcedure.input(z.object({ id, archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const result = await setMetadataFieldArchived(ctx.db, ctx.user.id, input.id, input.archived);
    if (!result.ok) throw serviceError(result);
    return { ok: true as const };
  }),
});
