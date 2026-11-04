import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deleteImage, listProductImages, reorderImages, setImageAlt, setPrimaryImage, type ImageError } from "../services/images";
import { router, staffProcedure } from "../trpc";

const CODES = { NOT_FOUND: "NOT_FOUND", INVALID: "BAD_REQUEST", TOO_LARGE: "PAYLOAD_TOO_LARGE", LIMIT: "BAD_REQUEST" } as const;
const imageError = (e: ImageError) => new TRPCError({ code: CODES[e.code], message: e.message });

const productId = z.string().min(1).max(40);
const imageId = z.string().min(1).max(40);

/** Uploading is a plain HTTP route (POST /media/upload), because tRPC is a poor fit for file bodies. Everything else is here. */
export const imagesRouter = router({
  list: staffProcedure.input(z.object({ productId })).query(({ ctx, input }) => listProductImages(ctx.db, input.productId)),

  setAlt: staffProcedure.input(z.object({ productId, imageId, altText: z.string().max(300) })).mutation(async ({ ctx, input }) => {
    const r = await setImageAlt(ctx.db, ctx.user.id, input.productId, input.imageId, input.altText);
    if (!r.ok) throw imageError(r);
    return { ok: true as const };
  }),

  setPrimary: staffProcedure.input(z.object({ productId, imageId })).mutation(async ({ ctx, input }) => {
    const r = await setPrimaryImage(ctx.db, ctx.user.id, input.productId, input.imageId);
    if (!r.ok) throw imageError(r);
    return { ok: true as const };
  }),

  reorder: staffProcedure.input(z.object({ productId, imageIds: z.array(imageId).max(50) })).mutation(async ({ ctx, input }) => {
    const r = await reorderImages(ctx.db, ctx.user.id, input.productId, input.imageIds);
    if (!r.ok) throw imageError(r);
    return { ok: true as const };
  }),

  delete: staffProcedure.input(z.object({ productId, imageId })).mutation(async ({ ctx, input }) => {
    const r = await deleteImage(ctx.db, ctx.env.MEDIA, ctx.user.id, input.productId, input.imageId);
    if (!r.ok) throw imageError(r);
    return { ok: true as const };
  }),
});
