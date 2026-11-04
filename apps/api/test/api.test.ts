import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { productImages, slugRedirects, users } from "@ffa/db";
import { newId } from "@ffa/validators";
import type { Env } from "../src/env";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
import { makeDb, type Db } from "../src/store";
import { sql } from "@ffa/db";
import { createTestDb, type TestDb } from "./d1";

const ADMIN_PASSWORD = "correct horse battery staple";
const STAFF_PASSWORD = "a different long passphrase";

let tdb: TestDb;
let db: Db;
let env: Env;

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = {
    DB: tdb.d1,
    MEDIA: {} as R2Bucket,
    SESSION_SECRET: "test-secret-".padEnd(48, "x"),
    ENVIRONMENT: "local",
    WEB_ORIGIN: "http://localhost:3000",
  };
  await db.insert(users).values({ id: "U_ADMIN", email: "owner@example.com", name: "Owner", role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD) });
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

/** A caller as if from a fresh HTTP request. */
function api(opts: { token?: string; ip?: string; client?: "pos" } = {}) {
  const headers = new Headers();
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.ip) headers.set("cf-connecting-ip", opts.ip);
  if (opts.client) headers.set("x-ffa-client", opts.client);
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers })));
}

async function signIn(email: string, password: string, ip = "198.51.100.1") {
  return (await api({ ip }).auth.login({ email, password })).token;
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

const tokenFromLink = (link: string) => new URL(link).searchParams.get("token")!;

let adminToken: string;
let staffId: string;
let staffToken: string;

describe("signing in", () => {
  it("signs in and returns a session that works", async () => {
    adminToken = await signIn("Owner@Example.com", ADMIN_PASSWORD);
    expect(await api({ token: adminToken }).auth.me()).toEqual({ id: "U_ADMIN", role: "ADMIN" });
  });

  it("gives the same answer for a wrong password and an unknown account, and audits both", async () => {
    const wrong = await rejection(api({ ip: "198.51.100.2" }).auth.login({ email: "owner@example.com", password: "not the password" }));
    const unknown = await rejection(api({ ip: "198.51.100.2" }).auth.login({ email: "nobody@example.com", password: "not the password" }));
    expect(wrong.code).toBe("UNAUTHORIZED");
    expect(unknown.message).toBe(wrong.message);
    const rows = await db.all<{ diff: string; ip: string }>(sql`SELECT diff, ip FROM audit_log WHERE action = 'auth.login.failed' ORDER BY at`);
    expect(rows.map((r) => JSON.parse(r.diff).reason)).toEqual(["BAD_PASSWORD", "UNKNOWN_USER"]);
    expect(rows[0]!.ip).toBe("198.51.100.2");
    expect(JSON.stringify(rows)).not.toContain("not the password");
  });

  it("rejects sessions without a token and with a tampered token", async () => {
    expect((await rejection(api().auth.me())).code).toBe("UNAUTHORIZED");
    expect((await rejection(api({ token: adminToken + "x" }).auth.me())).code).toBe("UNAUTHORIZED");
  });

  it("limits sign-in attempts per IP", async () => {
    const ip = "203.0.113.50";
    let blocked: TRPCError | undefined;
    for (let i = 0; i < 25 && !blocked; i++) {
      const error = await rejection(api({ ip }).auth.login({ email: "nobody@example.com", password: "whatever" }));
      if (error.code === "TOO_MANY_REQUESTS") blocked = error;
    }
    expect(blocked?.message).toMatch(/Too many attempts/);
    // Another address is unaffected.
    expect(await signIn("owner@example.com", ADMIN_PASSWORD, "203.0.113.51")).toBeTruthy();
  }, 60_000);
});

describe("inviting and password links", () => {
  it("lets an administrator invite a user and the user sets a password once", async () => {
    const invite = await api({ token: adminToken }).users.invite({ email: "Staff@Example.com", name: "Sam", role: "STAFF" });
    staffId = invite.userId;
    expect(invite.link).toMatch(/^http:\/\/localhost:3000\/set-password\?token=/);
    const token = tokenFromLink(invite.link);

    expect(await api().auth.tokenStatus({ token })).toEqual({ valid: true, purpose: "SET_PASSWORD", name: "Sam" });
    const weak = await rejection(api().auth.setPassword({ token, password: "short" }));
    expect(weak.code).toBe("BAD_REQUEST");
    expect(weak.message).toMatch(/at least 12/);

    await api().auth.setPassword({ token, password: STAFF_PASSWORD });
    expect((await rejection(api().auth.setPassword({ token, password: STAFF_PASSWORD }))).code).toBe("BAD_REQUEST");
    expect(await api().auth.tokenStatus({ token })).toEqual({ valid: false });

    staffToken = await signIn("staff@example.com", STAFF_PASSWORD);
    expect(await api({ token: staffToken }).auth.me()).toMatchObject({ role: "STAFF" });
  }, 30_000);

  it("refuses an invitation for an email that already has an account", async () => {
    const error = await rejection(api({ token: adminToken }).users.invite({ email: "staff@example.com", name: "Dup", role: "STAFF" }));
    expect(error.code).toBe("CONFLICT");
  });

  it("only the newest link for a user works, and a reset signs the user out everywhere", async () => {
    const first = await api({ token: adminToken }).users.issueLink({ userId: staffId });
    const second = await api({ token: adminToken }).users.issueLink({ userId: staffId });
    expect(first.purpose).toBe("RESET");
    expect(await api().auth.tokenStatus({ token: tokenFromLink(first.link) })).toEqual({ valid: false });

    await api().auth.setPassword({ token: tokenFromLink(second.link), password: "yet another long passphrase" });
    expect((await rejection(api({ token: staffToken }).auth.me())).code).toBe("UNAUTHORIZED");
    staffToken = await signIn("staff@example.com", "yet another long passphrase");
  }, 30_000);

  it("never lets an expired link work", async () => {
    const link = await api({ token: adminToken }).users.issueLink({ userId: staffId });
    await db.run(sql`UPDATE auth_token SET expires_at = 1 WHERE used_at IS NULL`);
    expect(await api().auth.tokenStatus({ token: tokenFromLink(link.link) })).toEqual({ valid: false });
    expect((await rejection(api().auth.setPassword({ token: tokenFromLink(link.link), password: "some other long passphrase" }))).code).toBe("BAD_REQUEST");
  }, 30_000);
});

describe("roles", () => {
  it("keeps STAFF out of administrator procedures and anonymous callers out of everything private", async () => {
    const staff = api({ token: staffToken });
    expect((await rejection(staff.users.list())).code).toBe("FORBIDDEN");
    expect((await rejection(staff.settings.get())).code).toBe("FORBIDDEN");
    expect((await rejection(staff.settings.update({ storeMode: "ONLINE_STORE" }))).code).toBe("FORBIDDEN");
    expect((await rejection(staff.users.invite({ email: "x@example.com", name: "X", role: "ADMIN" }))).code).toBe("FORBIDDEN");
    expect((await rejection(api().products.list({}))).code).toBe("UNAUTHORIZED");
    expect((await rejection(api().users.list())).code).toBe("UNAUTHORIZED");
  });

  it("lists users without password hashes", async () => {
    const list = await api({ token: adminToken }).users.list();
    expect(list.map((u) => u.email).sort()).toEqual(["owner@example.com", "staff@example.com"]);
    expect(JSON.stringify(list)).not.toMatch(/scrypt|passwordHash|password_hash/);
  });

  it("always keeps at least one active administrator", async () => {
    const admin = api({ token: adminToken });
    expect((await rejection(admin.users.update({ userId: "U_ADMIN", active: false }))).code).toBe("CONFLICT");
    expect((await rejection(admin.users.update({ userId: "U_ADMIN", role: "STAFF" }))).code).toBe("CONFLICT");

    await admin.users.update({ userId: staffId, role: "ADMIN" });
    await admin.users.update({ userId: "U_ADMIN", role: "STAFF" });
    // The former staff member is now the only administrator and cannot be demoted.
    const newAdminToken = await signIn("staff@example.com", "yet another long passphrase");
    expect((await rejection(api({ token: newAdminToken }).users.update({ userId: staffId, role: "STAFF" }))).code).toBe("CONFLICT");
    // Put things back.
    await api({ token: newAdminToken }).users.update({ userId: "U_ADMIN", role: "ADMIN" });
    await api({ token: newAdminToken }).users.update({ userId: staffId, role: "STAFF" });
    expect((await rejection(api({ token: newAdminToken }).users.list())).code).toBe("FORBIDDEN");
  }, 30_000);

  it("switching a user off, or revoking sessions, ends their sessions straight away", async () => {
    const admin = api({ token: adminToken });
    await admin.users.revokeSessions({ userId: staffId });
    expect((await rejection(api({ token: staffToken }).auth.me())).code).toBe("UNAUTHORIZED");
    staffToken = await signIn("staff@example.com", "yet another long passphrase");

    await admin.users.update({ userId: staffId, active: false });
    expect((await rejection(api({ token: staffToken }).auth.me())).code).toBe("UNAUTHORIZED");
    expect((await rejection(api({ ip: "198.51.100.9" }).auth.login({ email: "staff@example.com", password: "yet another long passphrase" }))).code).toBe("UNAUTHORIZED");
    await admin.users.update({ userId: staffId, active: true });
    staffToken = await signIn("staff@example.com", "yet another long passphrase");
  }, 30_000);

  it("audits role changes", async () => {
    const rows = await db.all<{ action: string }>(sql`SELECT DISTINCT action FROM audit_log WHERE action LIKE 'user.%'`);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["user.invite", "user.update", "user.password.set", "user.link", "user.sessions.revoke"]));
  });
});

describe("products and cost visibility", () => {
  let sku: string;
  let productId: string;

  it("hides cost from STAFF in every response, and only ADMIN can set it", async () => {
    const staff = api({ token: staffToken });
    expect((await rejection(staff.products.create({ title: "Sneaky", costCents: 100 }))).code).toBe("FORBIDDEN");

    const created = await api({ token: adminToken }).products.create({ title: "Luna Moth", priceCents: 15000, costCents: 6000, quantity: 1 });
    sku = created.sku;
    productId = created.id;
    expect(sku).toMatch(/^FFA-\d{6}$/);

    const asAdmin = await api({ token: adminToken }).products.get({ idOrSku: sku });
    expect(asAdmin).toHaveProperty("costCents", 6000);

    const asStaff = await staff.products.get({ idOrSku: sku.toLowerCase() });
    expect("costCents" in asStaff).toBe(false);
    expect(asStaff).toHaveProperty("priceCents", 15000);
    const list = await staff.products.list({});
    expect(JSON.stringify(list)).not.toMatch(/costCents|6000/);
    expect(list.items).toHaveLength(1);
  });

  it("enforces transition and stock rules for each role", async () => {
    const staff = api({ token: staffToken, client: "pos" });
    expect((await rejection(staff.products.changeStatus({ productId, to: "ARCHIVED" }))).code).toBe("FORBIDDEN");
    expect((await rejection(staff.products.changeStatus({ productId, to: "SOLD" }))).code).toBe("BAD_REQUEST");
    expect(await staff.products.changeStatus({ productId, to: "AVAILABLE" })).toEqual({ status: "AVAILABLE", quantity: 1 });
    expect((await rejection(staff.products.adjustStock({ productId, newQuantity: 3, reason: "" }))).code).toBe("BAD_REQUEST");
    expect(await staff.products.adjustStock({ productId, newQuantity: 3, reason: "Found more in the box" })).toEqual({ status: "AVAILABLE", quantity: 3 });
    const tx = await db.all<{ source: string; user_id: string }>(sql`SELECT source, user_id FROM inventory_transaction WHERE product_id = ${productId} ORDER BY at, id`);
    expect(tx.at(-1)).toMatchObject({ source: "POS" });
  });
});

describe("public catalog", () => {
  it("shows nothing publicly until the site is live, but lets signed-in staff preview", async () => {
    expect(await api().catalog.list({})).toEqual({ items: [], nextCursor: null });
    expect((await rejection(api().catalog.get({ skuOrSlug: "luna-moth" }))).code).toBe("NOT_FOUND");
    expect((await api({ token: staffToken }).catalog.list({})).items).toHaveLength(0); // no photo yet
  });

  it("lists only products with photos, with a whitelist of public fields", async () => {
    await api({ token: adminToken }).settings.update({ siteLive: true });
    expect((await api().catalog.list({})).items).toHaveLength(0);

    const [row] = await db.all<{ id: string; sku: string }>(sql`SELECT id, sku FROM product LIMIT 1`);
    await db.insert(productImages).values({ id: newId(), productId: row!.id, r2Key: "products/x.jpg", isPrimary: true });
    const { items } = await api().catalog.list({});
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual(
      ["currency", "description", "etsyUrl", "featured", "image", "priceCents", "remaining", "sku", "slug", "status", "title"],
    );
    expect(JSON.stringify(items)).not.toMatch(/costCents|6000|quantity/);
  });

  it("finds a piece by SKU, by slug and by an old slug", async () => {
    const [row] = await db.all<{ id: string; sku: string }>(sql`SELECT id, sku FROM product LIMIT 1`);
    await db.insert(slugRedirects).values({ slug: "old-luna-moth", productId: row!.id });
    for (const key of [row!.sku, row!.sku.toLowerCase(), "luna-moth", "old-luna-moth"]) {
      expect((await api().catalog.get({ skuOrSlug: key })).sku).toBe(row!.sku);
    }
    expect((await rejection(api().catalog.get({ skuOrSlug: "nope" }))).code).toBe("NOT_FOUND");
  });

  it("never reveals drafts, archived items or a pending payment", async () => {
    const admin = api({ token: adminToken });
    const draft = await admin.products.create({ title: "Hidden draft" });
    await db.insert(productImages).values({ id: newId(), productId: draft.id, r2Key: "products/draft.jpg", isPrimary: true });
    expect((await rejection(api().catalog.get({ skuOrSlug: draft.sku }))).code).toBe("NOT_FOUND");
    const [row] = await db.all<{ id: string; sku: string }>(sql`SELECT id, sku FROM product WHERE title = 'Luna Moth'`);
    await admin.products.changeStatus({ productId: row!.id, to: "PENDING_PAYMENT" });
    expect((await api().catalog.get({ skuOrSlug: row!.sku })).status).toBe("AVAILABLE");
  });
});

describe("error responses", () => {
  it("never include stack traces", async () => {
    const { default: worker } = await import("../src/index");
    const res = await worker.fetch(new Request("https://api.test/trpc/users.list"), env);
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain("UNAUTHORIZED");
    expect(body).not.toMatch(/stack|at async|index\.js/);
  });
});

describe("settings", () => {
  it("shares only public settings with the public site", async () => {
    const pub = await api().settings.public();
    expect(pub).toMatchObject({ siteLive: true, storeMode: "SHOWCASE_ONLY" });
    expect(JSON.stringify(pub)).not.toMatch(/asa@|noreply@|qrBaseUrl|taxRegistered/);
    expect(await api({ token: adminToken }).settings.get()).toHaveProperty("inquiryEmail", "asa@forestfae.ca");
  });
  it("rejects invalid values", async () => {
    const error = await rejection(api({ token: adminToken }).settings.update({ qrBaseUrl: "javascript:alert(1)" }));
    expect(error.code).toBe("BAD_REQUEST");
  });
});
