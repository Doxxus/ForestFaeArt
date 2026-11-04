import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { INQUIRY_STATUSES } from "@ffa/validators";
import { RATE_LIMITS, hitRateLimit } from "../services/rate-limit";
import {
  getInquiry,
  listInquiries,
  receiveInquiry,
  replyToInquiry,
  retryDelivery,
  setInquiryStatus,
  type MailContext,
} from "../services/inquiries";
import { loadSettings } from "../services/settings";
import { adminProcedure, publicProcedure, optionalUser, router, type Context } from "../trpc";

const id = z.string().min(1).max(40);

async function mailFor(ctx: Context): Promise<MailContext> {
  return { db: ctx.db, email: ctx.email, settings: await loadSettings(ctx.db), webOrigin: ctx.env.WEB_ORIGIN };
}

/** Always the same answer, so a robot can't tell whether it was caught. */
const THANKS = { ok: true as const };

export const inquiriesRouter = router({
  /** The contact form and "Ask about this piece" (WEB-7, WEB-8). Saved to the database first, then emailed. */
  submit: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Please tell us your name.").max(120),
        email: z.string().trim().email("Please enter a valid email address.").max(254),
        message: z.string().trim().min(5, "Please write a message.").max(4000),
        sku: z.string().trim().max(20).optional(),
        /** A hidden field real visitors never fill in. */
        website: z.string().max(200).optional(),
        turnstileToken: z.string().max(4096).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const limited = await hitRateLimit(ctx.db, `inquiry:${ctx.ip ?? "unknown"}`, RATE_LIMITS.inquiryPerIp);
      if (!limited.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You've sent a few messages already. Please try again a little later." });
      }
      const settings = await loadSettings(ctx.db);
      if (!settings.siteLive && !(await optionalUser(ctx))) throw new TRPCError({ code: "NOT_FOUND", message: "The website isn't open yet." });
      if (input.website) return THANKS;
      if (!(await ctx.verifyHuman(input.turnstileToken))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "We couldn't confirm you're a person. Please refresh the page and try again." });
      }
      await receiveInquiry({ db: ctx.db, email: ctx.email, settings, webOrigin: ctx.env.WEB_ORIGIN }, input);
      return THANKS;
    }),

  // ---- administrator ----
  list: adminProcedure
    .input(z.object({ status: z.enum(INQUIRY_STATUSES).optional(), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) }).default({ limit: 50, offset: 0 }))
    .query(({ ctx, input }) => listInquiries(ctx.db, input)),

  get: adminProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const inquiry = await getInquiry(ctx.db, input.id);
    if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "That inquiry doesn't exist." });
    return { ...inquiry, emailConfigured: ctx.email !== null };
  }),

  reply: adminProcedure.input(z.object({ id, body: z.string().trim().min(1, "Please write a reply first.").max(8000) })).mutation(async ({ ctx, input }) => {
    const r = await replyToInquiry(await mailFor(ctx), ctx.user.id, input.id, input.body);
    if (!r.ok) throw new TRPCError({ code: r.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST", message: r.message });
    return { delivery: r.delivery, error: r.error };
  }),

  retry: adminProcedure
    .input(z.object({ inquiryId: id.optional(), replyId: id.optional() }).refine((v) => Boolean(v.inquiryId) !== Boolean(v.replyId), "Choose one thing to retry."))
    .mutation(async ({ ctx, input }) => {
      const r = await retryDelivery(await mailFor(ctx), input.replyId ? { replyId: input.replyId } : { inquiryId: input.inquiryId! });
      return r.ok ? { ok: true as const, error: null } : { ok: false as const, error: r.error };
    }),

  setStatus: adminProcedure.input(z.object({ id, status: z.enum(["NEW", "ARCHIVED"]) })).mutation(async ({ ctx, input }) => {
    const r = await setInquiryStatus(ctx.db, ctx.user.id, input.id, input.status);
    if (!r.ok) throw new TRPCError({ code: "NOT_FOUND", message: r.message });
    return { ok: true as const };
  }),
});
