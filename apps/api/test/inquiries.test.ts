import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { sql, users } from "@ffa/db";
import type { Env } from "../src/env";
import { ResendProvider, oneLine, type EmailMessage, type EmailProvider, type EmailResult } from "../src/email/provider";
import { appRouter } from "../src/router";
import { createContext, type Context } from "../src/trpc";
import { makeDb, type Db } from "../src/store";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
let env: Env;
let adminToken: string;
let staffToken: string;

class FakeEmail implements EmailProvider {
  sent: EmailMessage[] = [];
  next: EmailResult = { ok: true, id: "msg_1" };
  async send(m: EmailMessage) {
    this.sent.push(m);
    return this.next;
  }
}
let mail: FakeEmail;

function as(opts: { token?: string; ip?: string; email?: EmailProvider | null; human?: boolean } = {}) {
  const headers = new Headers();
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.ip) headers.set("cf-connecting-ip", opts.ip);
  const overrides: Partial<Pick<Context, "email" | "verifyHuman">> = { email: "email" in opts ? (opts.email ?? null) : mail };
  if (opts.human !== undefined) overrides.verifyHuman = async () => opts.human!;
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers }), overrides));
}
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error;
    throw error;
  }
  throw new Error("Expected the call to be rejected");
};
let ipCounter = 0;
const freshIp = () => `203.0.113.${++ipCounter}`;

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "https://web.test" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "Asa", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "S", role: "STAFF", passwordHash: hash },
  ]);
  const login = async (email: string) => (await as({ email: null }).auth.login({ email, password: "correct horse battery staple" })).token;
  adminToken = await login("a@example.com");
  staffToken = await login("s@example.com");
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

const admin = () => as({ token: adminToken });
const form = { name: "Sam Visitor", email: "Sam@Example.com", message: "Is the luna moth still available?" };

describe("sending a message from the website", () => {
  it("is closed until the site is published", async () => {
    mail = new FakeEmail();
    expect((await rejection(as({ ip: freshIp() }).inquiries.submit(form))).code).toBe("NOT_FOUND");
    expect(mail.sent).toHaveLength(0);
    expect((await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM inquiry`))[0]!.n).toBe(0);
    await admin().settings.update({ siteLive: true });
  });

  it("saves the message first, then emails the inbox with Reply-To set to the visitor", async () => {
    mail = new FakeEmail();
    expect(await as({ ip: freshIp() }).inquiries.submit(form)).toEqual({ ok: true });
    const [saved] = (await admin().inquiries.list()).items;
    expect(saved).toMatchObject({ name: "Sam Visitor", email: "sam@example.com", status: "NEW", emailDeliveryStatus: "SENT" });
    expect(mail.sent).toHaveLength(1);
    const m = mail.sent[0]!;
    expect(m).toMatchObject({ from: "Forest Fae Folk Art <noreply@forestfae.ca>", to: ["asa@forestfae.ca"], replyTo: "sam@example.com", subject: "New message from Sam Visitor" });
    expect(m.text).toContain("Is the luna moth still available?");
    expect(m.text).toContain(`https://web.test/admin/inquiries/${saved!.id}`);
    expect(m.idempotencyKey).toBe(`inquiry-${saved!.id}`);
  });

  it("mentions the piece when asked about one, and ignores a made-up SKU", async () => {
    mail = new FakeEmail();
    const piece = await admin().products.create({ title: "Luna Moth in Walnut Frame" });
    await as({ ip: freshIp() }).inquiries.submit({ ...form, sku: piece.sku.toLowerCase() });
    expect(mail.sent[0]).toMatchObject({ subject: "Question about Luna Moth in Walnut Frame" });
    expect(mail.sent[0]!.text).toContain(`(${piece.sku})\nhttps://web.test/p/${piece.sku}`);
    await as({ ip: freshIp() }).inquiries.submit({ ...form, sku: "FFA-999999" });
    expect(mail.sent[1]).toMatchObject({ subject: "New message from Sam Visitor" });
    const items = (await admin().inquiries.list()).items;
    expect(items.find((i) => i.sku === piece.sku)?.productTitle).toBe("Luna Moth in Walnut Frame");
  });

  it("escapes anything a visitor types and keeps line breaks out of headers", async () => {
    mail = new FakeEmail();
    await as({ ip: freshIp() }).inquiries.submit({ name: "Evil\r\nBcc: x@y.z", email: "e@example.com", message: "<script>alert(1)</script> & <b>bold</b>" });
    const m = mail.sent[0]!;
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;");
    expect(oneLine("a\r\nb\u2028c")).toBe("a b c");
  });

  it("quietly drops robots that fill in the hidden field and refuses failed human checks", async () => {
    mail = new FakeEmail();
    const before = (await admin().inquiries.list()).total;
    expect(await as({ ip: freshIp() }).inquiries.submit({ ...form, website: "http://spam.example" })).toEqual({ ok: true });
    expect((await admin().inquiries.list()).total).toBe(before);
    expect(mail.sent).toHaveLength(0);
    expect((await rejection(as({ ip: freshIp(), human: false }).inquiries.submit(form))).message).toMatch(/person/);
    expect((await admin().inquiries.list()).total).toBe(before);
  });

  it("checks the form and limits each address to a few messages an hour", async () => {
    mail = new FakeEmail();
    const ip = freshIp();
    expect((await rejection(as({ ip }).inquiries.submit({ ...form, email: "nope" }))).code).toBe("BAD_REQUEST");
    expect((await rejection(as({ ip }).inquiries.submit({ ...form, message: "hi" }))).code).toBe("BAD_REQUEST");
    const attempts = [];
    for (let i = 0; i < 6; i++) attempts.push(as({ ip: "198.51.100.99" }).inquiries.submit(form).then(() => "ok", (e: TRPCError) => e.code));
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    expect(results).toContain("TOO_MANY_REQUESTS");
  });
});

describe("when email is not working", () => {
  it("keeps the message and waits when no provider is set up, then sends once it is", async () => {
    const r = as({ ip: freshIp(), email: null });
    await r.inquiries.submit({ ...form, message: "Sent before email is ready." });
    const item = (await admin().inquiries.list()).items.find((i) => i.preview.startsWith("Sent before"))!;
    expect(item.emailDeliveryStatus).toBe("PENDING");
    expect((await as({ token: staffToken, email: null }).site.attention()).emailNotSetUp).toBe(true);
    expect((await as({ token: staffToken, email: null }).site.attention()).waitingEmails).toBeGreaterThan(0);
    expect((await admin().inquiries.get({ id: item.id })).emailError).toMatch(/isn't set up/);

    mail = new FakeEmail();
    expect(await as({ token: adminToken }).inquiries.retry({ inquiryId: item.id })).toEqual({ ok: true, error: null });
    expect((await admin().inquiries.get({ id: item.id })).emailDeliveryStatus).toBe("SENT");
    expect(mail.sent[0]!.text).toContain("Sent before email is ready.");
  });

  it("records a failure with its reason, still keeps the message, and retries", async () => {
    mail = new FakeEmail();
    mail.next = { ok: false, error: "Email provider said 403: domain not verified" };
    await as({ ip: freshIp() }).inquiries.submit({ ...form, message: "This one fails to send." });
    const item = (await admin().inquiries.list()).items.find((i) => i.preview.startsWith("This one fails"))!;
    expect(item.emailDeliveryStatus).toBe("FAILED");
    expect((await admin().inquiries.get({ id: item.id })).emailError).toMatch(/domain not verified/);
    expect((await staff().site.attention()).failedEmails).toBeGreaterThanOrEqual(1);

    mail.next = { ok: true, id: "ok" };
    await admin().inquiries.retry({ inquiryId: item.id });
    expect((await admin().inquiries.get({ id: item.id })).emailError).toBeNull();
    mail.next = { ok: false, error: "still down" };
    expect(await admin().inquiries.retry({ inquiryId: item.id })).toEqual({ ok: false, error: "still down" });
  });

  it("explains when there is no inbox address to send to", async () => {
    mail = new FakeEmail();
    await admin().settings.update({ inquiryEmail: "" });
    await as({ ip: freshIp() }).inquiries.submit({ ...form, message: "No inbox address set." });
    const item = (await admin().inquiries.list()).items.find((i) => i.preview.startsWith("No inbox"))!;
    expect((await admin().inquiries.get({ id: item.id })).emailError).toMatch(/Add one in Settings/);
    expect(mail.sent).toHaveLength(0);
    await admin().settings.update({ inquiryEmail: "asa@forestfae.ca" });
  });
});

const staff = () => as({ token: staffToken });

describe("the inquiries screen", () => {
  it("is for administrators only", async () => {
    expect((await rejection(staff().inquiries.list())).code).toBe("FORBIDDEN");
    expect((await rejection(staff().inquiries.reply({ id: "x", body: "hi" }))).code).toBe("FORBIDDEN");
    expect((await rejection(as().inquiries.list())).code).toBe("UNAUTHORIZED");
  });

  it("replies as asa@, stores the reply and marks the inquiry replied once it is sent", async () => {
    mail = new FakeEmail();
    await as({ ip: freshIp() }).inquiries.submit({ ...form, name: "Riley", message: "Do you ship to Calgary?" });
    const item = (await admin().inquiries.list({ status: "NEW" })).items.find((i) => i.name === "Riley")!;
    mail.sent = [];

    const r = await admin().inquiries.reply({ id: item.id, body: "Yes we do!\n\nThanks, Asa" });
    expect(r).toEqual({ delivery: "SENT", error: null });
    expect(mail.sent[0]).toMatchObject({ from: "Forest Fae Folk Art <asa@forestfae.ca>", to: ["sam@example.com"], replyTo: "asa@forestfae.ca", subject: "Re: your message to Forest Fae Folk Art" });
    expect(mail.sent[0]!.text).toContain("Yes we do!");
    expect(mail.sent[0]!.text).toContain("> Do you ship to Calgary?");

    const got = await admin().inquiries.get({ id: item.id });
    expect(got.status).toBe("REPLIED");
    expect(got.repliedAt).toBeInstanceOf(Date);
    expect(got.replies).toMatchObject([{ body: "Yes we do!\n\nThanks, Asa", deliveryStatus: "SENT" }]);
    expect((await admin().inquiries.list({ status: "NEW" })).items.some((i) => i.id === item.id)).toBe(false);
  });

  it("keeps a reply that failed to send, leaves the inquiry open, and lets the owner retry it", async () => {
    mail = new FakeEmail();
    await as({ ip: freshIp() }).inquiries.submit({ ...form, name: "Jordan", message: "Custom order possible?" });
    const item = (await admin().inquiries.list({ status: "NEW" })).items.find((i) => i.name === "Jordan")!;
    mail.next = { ok: false, error: "Provider timeout" };
    const r = await admin().inquiries.reply({ id: item.id, body: "Of course." });
    expect(r).toEqual({ delivery: "FAILED", error: "Provider timeout" });
    let got = await admin().inquiries.get({ id: item.id });
    expect(got.status).toBe("NEW");
    expect(got.replies[0]).toMatchObject({ deliveryStatus: "FAILED", deliveryError: "Provider timeout" });

    mail.next = { ok: true, id: "m2" };
    await admin().inquiries.retry({ replyId: got.replies[0]!.id });
    got = await admin().inquiries.get({ id: item.id });
    expect(got.status).toBe("REPLIED");
    expect(got.replies[0]).toMatchObject({ deliveryStatus: "SENT", deliveryError: null });
  });

  it("holds a reply while email isn't set up", async () => {
    mail = new FakeEmail();
    await as({ ip: freshIp() }).inquiries.submit({ ...form, name: "Casey", message: "Hello there friend" });
    const item = (await admin().inquiries.list({ status: "NEW" })).items.find((i) => i.name === "Casey")!;
    const r = await as({ token: adminToken, email: null }).inquiries.reply({ id: item.id, body: "Hi Casey" });
    expect(r.delivery).toBe("PENDING");
    expect((await admin().inquiries.get({ id: item.id })).status).toBe("NEW");
    expect((await as({ token: adminToken, email: null }).inquiries.get({ id: item.id })).emailConfigured).toBe(false);
  });

  it("archives and reopens, and rejects empty replies and missing inquiries", async () => {
    const item = (await admin().inquiries.list()).items[0]!;
    await admin().inquiries.setStatus({ id: item.id, status: "ARCHIVED" });
    expect((await admin().inquiries.get({ id: item.id })).status).toBe("ARCHIVED");
    await admin().inquiries.setStatus({ id: item.id, status: "NEW" });
    expect((await rejection(admin().inquiries.reply({ id: item.id, body: "   " }))).code).toBe("BAD_REQUEST");
    expect((await rejection(admin().inquiries.reply({ id: "nope", body: "hi" }))).code).toBe("NOT_FOUND");
    expect((await rejection(admin().inquiries.get({ id: "nope" }))).code).toBe("NOT_FOUND");
    expect((await rejection(admin().inquiries.retry({}))).code).toBe("BAD_REQUEST");
  });
});

describe("the Resend adapter", () => {
  const message: EmailMessage = { from: "A <a@x.ca>", to: ["b@y.ca"], replyTo: "c@z.ca", subject: "Hi\r\nBcc: evil", text: "t", html: "<p>t</p>", idempotencyKey: "key-1" };

  it("posts the message with the key, reply-to and an idempotency header", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await new ResendProvider("re_secret", fetcher).send(message)).toEqual({ ok: true, id: "re_123" });
    expect(seen!.url).toBe("https://api.resend.com/emails");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_secret");
    expect(headers["idempotency-key"]).toBe("key-1");
    const body = JSON.parse(seen!.init.body as string);
    expect(body).toMatchObject({ from: "A <a@x.ca>", to: ["b@y.ca"], reply_to: "c@z.ca", subject: "Hi Bcc: evil" });
  });

  it("calls the default fetch as a plain function, which Workers require", async () => {
    const original = globalThis.fetch;
    let receiver: unknown = "unset";
    globalThis.fetch = function (this: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- the receiver is exactly what this test checks
      receiver = this;
      return Promise.resolve(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    } as typeof fetch;
    try {
      expect(await new ResendProvider("re_secret").send(message)).toEqual({ ok: true, id: "re_1" });
      expect(receiver === undefined || receiver === globalThis).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("turns errors into plain messages without leaking the key", async () => {
    const denied = (async () => new Response(JSON.stringify({ message: "The domain is not verified", name: "validation_error" }), { status: 403 })) as unknown as typeof fetch;
    const r = await new ResendProvider("re_secret", denied).send(message);
    expect(r).toEqual({ ok: false, error: "Email provider said 403: The domain is not verified" });
    const down = (async () => {
      throw new Error("connect failed re_secret");
    }) as unknown as typeof fetch;
    const r2 = await new ResendProvider("re_secret", down).send(message);
    expect(r2).toEqual({ ok: false, error: "Couldn't reach the email provider." });
    expect(JSON.stringify([r, r2])).not.toContain("re_secret");
  });
});
