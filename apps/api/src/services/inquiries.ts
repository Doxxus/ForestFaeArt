import { and, desc, eq, inquiries, inquiryReplies, products, sql } from "@ffa/db";
import { newId, type DeliveryStatus, type InquiryStatus, type Settings } from "@ffa/validators";
import { inquiryNotification, inquiryReply } from "../email/templates";
import type { EmailProvider } from "../email/provider";
import { auditStatement } from "./audit";
import type { Db } from "../store";

export type InquiryError = { ok: false; code: "NOT_FOUND" | "INVALID"; message: string };
const fail = (code: InquiryError["code"], message: string): InquiryError => ({ ok: false, code, message });

type Batchable = Parameters<Db["batch"]>[0][number];
const runBatch = (db: Db, statements: Batchable[]) => db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

export interface MailContext {
  db: Db;
  /** Null until a provider is set up. Messages then wait as PENDING and nothing is lost. */
  email: EmailProvider | null;
  settings: Settings;
  webOrigin: string;
}

const NOT_SET_UP = "Email isn't set up yet, so this is waiting to be sent.";

// ---------------------------------------------------------------------------
// Saving a message from the website (WEB-7, WEB-8)
// ---------------------------------------------------------------------------

export interface NewInquiry {
  name: string;
  email: string;
  message: string;
  /** The piece the visitor asked about, if any. Ignored unless it exists. */
  sku?: string | null;
}

/** Saves first, then tries to email. A failed or missing send never loses the message (EML-6). */
export async function receiveInquiry(mail: MailContext, input: NewInquiry): Promise<{ id: string; delivery: DeliveryStatus }> {
  const product = input.sku
    ? await mail.db.select({ id: products.id }).from(products).where(eq(products.sku, input.sku.trim().toUpperCase())).get()
    : undefined;
  const id = newId();
  await mail.db.insert(inquiries).values({ id, productId: product?.id ?? null, name: input.name.trim(), email: input.email.trim().toLowerCase(), message: input.message.trim() });
  const sent = await sendInquiryNotification(mail, id);
  return { id, delivery: sent.ok ? "SENT" : sent.pending ? "PENDING" : "FAILED" };
}

/** Sends (or re-sends) the "you have a message" email to the inbox address. */
export async function sendInquiryNotification(mail: MailContext, inquiryId: string): Promise<{ ok: true } | { ok: false; pending: boolean; error: string }> {
  const row = await mail.db
    .select({ i: inquiries, sku: products.sku, productTitle: products.title })
    .from(inquiries)
    .leftJoin(products, eq(products.id, inquiries.productId))
    .where(eq(inquiries.id, inquiryId))
    .get();
  if (!row) return { ok: false, pending: false, error: "That inquiry doesn't exist." };

  const mark = async (status: DeliveryStatus, error: string | null) => {
    await mail.db.update(inquiries).set({ emailDeliveryStatus: status, emailError: error }).where(eq(inquiries.id, inquiryId));
  };
  if (!mail.email) {
    await mark("PENDING", NOT_SET_UP);
    return { ok: false, pending: true, error: NOT_SET_UP };
  }
  const to = mail.settings.inquiryEmail.trim();
  if (!to) {
    const error = "There is no address to send inquiries to. Add one in Settings.";
    await mark("FAILED", error);
    return { ok: false, pending: false, error };
  }

  const message = inquiryNotification(
    {
      name: row.i.name,
      email: row.i.email,
      message: row.i.message,
      product: row.sku ? { sku: row.sku, title: row.productTitle ?? row.sku, url: `${mail.webOrigin}/p/${row.sku}` } : null,
    },
    {
      businessName: mail.settings.businessName,
      from: mail.settings.systemFromEmail,
      to,
      adminUrl: `${mail.webOrigin}/admin/inquiries/${inquiryId}`,
      idempotencyKey: `inquiry-${inquiryId}`,
    },
  );
  const result = await mail.email.send(message);
  if (result.ok) {
    await mark("SENT", null);
    return { ok: true };
  }
  console.error(JSON.stringify({ event: "inquiry-email-failed", inquiryId, error: result.error }));
  await mark("FAILED", result.error);
  return { ok: false, pending: false, error: result.error };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listInquiries(db: Db, opts: { status?: InquiryStatus; limit?: number; offset?: number } = {}) {
  const where = opts.status ? eq(inquiries.status, opts.status) : undefined;
  const [rows, count] = await Promise.all([
    db
      .select({ i: inquiries, sku: products.sku, productTitle: products.title })
      .from(inquiries)
      .leftJoin(products, eq(products.id, inquiries.productId))
      .where(where)
      .orderBy(desc(inquiries.createdAt), desc(inquiries.id))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0)
      .all(),
    db.select({ n: sql<number>`COUNT(*)` }).from(inquiries).where(where).get(),
  ]);
  return {
    total: count?.n ?? 0,
    items: rows.map(({ i, sku, productTitle }) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      preview: i.message.slice(0, 140),
      status: i.status,
      emailDeliveryStatus: i.emailDeliveryStatus,
      createdAt: i.createdAt,
      sku,
      productTitle,
    })),
  };
}

export async function getInquiry(db: Db, id: string) {
  const row = await db
    .select({ i: inquiries, sku: products.sku, productTitle: products.title })
    .from(inquiries)
    .leftJoin(products, eq(products.id, inquiries.productId))
    .where(eq(inquiries.id, id))
    .get();
  if (!row) return null;
  const replies = await db.select().from(inquiryReplies).where(eq(inquiryReplies.inquiryId, id)).orderBy(inquiryReplies.sentAt).all();
  return {
    id: row.i.id,
    name: row.i.name,
    email: row.i.email,
    message: row.i.message,
    status: row.i.status,
    emailDeliveryStatus: row.i.emailDeliveryStatus,
    emailError: row.i.emailError,
    createdAt: row.i.createdAt,
    repliedAt: row.i.repliedAt,
    sku: row.sku,
    productTitle: row.productTitle,
    replies: replies.map((r) => ({ id: r.id, body: r.body, sentAt: r.sentAt, deliveryStatus: r.deliveryStatus, deliveryError: r.deliveryError })),
  };
}

// ---------------------------------------------------------------------------
// Replying (EML-5 a)
// ---------------------------------------------------------------------------

async function deliverReply(mail: MailContext, replyId: string): Promise<{ ok: true } | { ok: false; pending: boolean; error: string }> {
  const row = await mail.db
    .select({ r: inquiryReplies, i: inquiries })
    .from(inquiryReplies)
    .innerJoin(inquiries, eq(inquiries.id, inquiryReplies.inquiryId))
    .where(eq(inquiryReplies.id, replyId))
    .get();
  if (!row) return { ok: false, pending: false, error: "That reply doesn't exist." };

  const mark = async (status: DeliveryStatus, error: string | null, providerId: string | null = null) => {
    await runBatch(mail.db, [
      mail.db.update(inquiryReplies).set({ deliveryStatus: status, deliveryError: error, ...(providerId ? { providerMessageId: providerId } : {}) }).where(eq(inquiryReplies.id, replyId)),
      ...(status === "SENT"
        ? [mail.db.update(inquiries).set({ status: "REPLIED", repliedAt: new Date() }).where(and(eq(inquiries.id, row.i.id), eq(inquiries.status, "NEW")))]
        : []),
    ]);
  };
  if (!mail.email) {
    await mark("PENDING", NOT_SET_UP);
    return { ok: false, pending: true, error: NOT_SET_UP };
  }
  const fromAddress = mail.settings.replyToEmail.trim();
  if (!fromAddress) {
    const error = "There is no address to send replies from. Add one in Settings.";
    await mark("FAILED", error);
    return { ok: false, pending: false, error };
  }
  const result = await mail.email.send(
    inquiryReply({ businessName: mail.settings.businessName, fromAddress, to: row.i.email, visitorName: row.i.name, originalMessage: row.i.message, body: row.r.body, idempotencyKey: `reply-${replyId}` }),
  );
  if (result.ok) {
    await mark("SENT", null, result.id);
    return { ok: true };
  }
  console.error(JSON.stringify({ event: "inquiry-reply-failed", replyId, error: result.error }));
  await mark("FAILED", result.error);
  return { ok: false, pending: false, error: result.error };
}

/** Saves the reply with the inquiry, then sends it. The inquiry becomes "Replied" only once the email has gone. */
export async function replyToInquiry(
  mail: MailContext,
  actorId: string,
  inquiryId: string,
  body: string,
): Promise<{ ok: true; replyId: string; delivery: DeliveryStatus; error: string | null } | InquiryError> {
  const text = body.trim();
  if (!text) return fail("INVALID", "Please write a reply first.");
  const inquiry = await mail.db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.id, inquiryId)).get();
  if (!inquiry) return fail("NOT_FOUND", "That inquiry doesn't exist.");
  const replyId = newId();
  await runBatch(mail.db, [
    mail.db.insert(inquiryReplies).values({ id: replyId, inquiryId, userId: actorId, body: text }),
    auditStatement(mail.db, { userId: actorId, action: "inquiry.reply", entityType: "inquiry", entityId: inquiryId, diff: { replyId } }),
  ]);
  const sent = await deliverReply(mail, replyId);
  return { ok: true, replyId, delivery: sent.ok ? "SENT" : sent.pending ? "PENDING" : "FAILED", error: sent.ok ? null : sent.error };
}

/** Tries again for a message that failed or was waiting. `what` is the inquiry notification or one reply. */
export async function retryDelivery(
  mail: MailContext,
  target: { inquiryId: string } | { replyId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = "replyId" in target ? await deliverReply(mail, target.replyId) : await sendInquiryNotification(mail, target.inquiryId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function setInquiryStatus(db: Db, actorId: string, id: string, status: Extract<InquiryStatus, "NEW" | "ARCHIVED">): Promise<{ ok: true } | InquiryError> {
  const found = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.id, id)).get();
  if (!found) return fail("NOT_FOUND", "That inquiry doesn't exist.");
  await runBatch(db, [
    db.update(inquiries).set({ status }).where(eq(inquiries.id, id)),
    auditStatement(db, { userId: actorId, action: `inquiry.${status === "ARCHIVED" ? "archive" : "reopen"}`, entityType: "inquiry", entityId: id }),
  ]);
  return { ok: true };
}
