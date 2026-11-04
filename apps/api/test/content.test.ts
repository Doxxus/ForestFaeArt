import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@ffa/auth";
import { users } from "@ffa/db";
import type { Env } from "../src/env";
import worker from "../src/index";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
import { makeDb, type Db } from "../src/store";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let db: Db;
let env: Env;
let adminToken: string;
let admin: ReturnType<typeof as>;
let staff: ReturnType<typeof as>;

function as(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers })));
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

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "https://web.test" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "A", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "S", role: "STAFF", passwordHash: hash },
  ]);
  const login = async (email: string) => (await as().auth.login({ email, password: "correct horse battery staple" })).token;
  adminToken = await login("a@example.com");
  admin = as(adminToken);
  staff = as(await login("s@example.com"));
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

describe("website pages", () => {
  it("starts with placeholder copy flagged as draft", async () => {
    const pages = await admin.content.list();
    expect(pages.map((p) => p.key)).toEqual(["about", "home_teaser", "contact", "privacy", "terms"]);
    expect(pages.every((p) => p.isDraft && p.placeholder && !p.hasImage)).toBe(true);
    expect((await admin.content.get({ key: "about" })).body).toMatch(/^Lorem ipsum/);
  });

  it("is for administrators only", async () => {
    expect((await rejection(staff.content.list())).code).toBe("FORBIDDEN");
    expect((await rejection(staff.content.update({ key: "about", body: "x" }))).code).toBe("FORBIDDEN");
    expect((await rejection(as().content.get({ key: "about" }))).code).toBe("UNAUTHORIZED");
  });

  it("editing the words counts as reviewing them, unless the owner says it is still a draft", async () => {
    await admin.content.update({ key: "about", title: "About us", body: "We make small wonders from wings." });
    expect(await admin.content.get({ key: "about" })).toMatchObject({ title: "About us", body: "We make small wonders from wings.", isDraft: false, placeholder: false });
    await admin.content.update({ key: "privacy", body: "Lorem ipsum, still being written." });
    expect((await admin.content.get({ key: "privacy" })).isDraft).toBe(false);
    expect((await admin.content.get({ key: "privacy" })).placeholder).toBe(true); // still flagged by its words
    await admin.content.update({ key: "terms", body: "Work in progress.", isDraft: true });
    expect((await admin.content.get({ key: "terms" })).isDraft).toBe(true);
    expect((await rejection(admin.content.update({ key: "about", title: "   " }))).code).toBe("BAD_REQUEST");
    expect((await rejection(admin.content.get({ key: "nope" as "about" }))).code).toBe("BAD_REQUEST");
  });

  it("serves pages publicly only once the site is published, and only known pages", async () => {
    expect((await rejection(as().content.publicGet({ key: "about" }))).code).toBe("NOT_FOUND");
    expect((await as(adminToken).content.publicGet({ key: "about" })).title).toBe("About us");
    await admin.settings.update({ siteLive: true });
    expect(await as().content.publicGet({ key: "about" })).toEqual({ title: "About us", body: "We make small wonders from wings.", imagePath: null });
    expect((await rejection(as().content.publicGet({ key: "secrets" }))).code).toBe("NOT_FOUND");
    expect((await rejection(as().content.publicGet({ key: "../etc" }))).code).toBe("NOT_FOUND");
    await admin.settings.update({ siteLive: false });
  });

  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type: string, data: number[]) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [...u32(20), ...u32(10), 8, 6, 0, 0, 0]), ...chunk("IDAT", [1]), ...chunk("IEND", [])]);
  const upload = (token: string | null) => {
    const headers = new Headers({ "content-type": "image/png" });
    if (token) headers.set("authorization", `Bearer ${token}`);
    return worker.fetch(new Request("https://api.test/media/upload?contentKey=about", { method: "POST", headers, body: png }), env);
  };

  it("holds one picture per page, replaced and removed cleanly, for administrators only", async () => {
    const staffToken = (await as().auth.login({ email: "s@example.com", password: "correct horse battery staple" })).token;
    expect((await upload(staffToken)).status).toBe(403);
    expect((await upload(null)).status).toBe(401);
    const first = ((await (await upload(adminToken)).json()) as { image: { path: string } }).image.path;
    expect(first).toMatch(/^\/media\/content\/[0-9A-Z]{26}\/[0-9A-Z]{26}\.png$/);
    expect((await admin.content.get({ key: "about" })).imagePath).toBe(first);
    const second = ((await (await upload(adminToken)).json()) as { image: { path: string } }).image.path;
    expect(await tdb.r2.get(first.replace("/media/", ""))).toBeNull();
    await admin.content.removeImage({ key: "about" });
    expect((await admin.content.get({ key: "about" })).imagePath).toBeNull();
    expect(await tdb.r2.get(second.replace("/media/", ""))).toBeNull();
  });
});

describe("needs attention", () => {
  it("counts what still needs the owner's eye", async () => {
    const a = await staff.site.attention();
    expect(a).toMatchObject({
      siteLive: false,
      sourcingPlaceholder: true,
      placeholderCategories: 8,
      contactMissing: false,
      publicPieces: 0,
      piecesNeedingPhotos: 0,
      reservedPieces: 0,
      draftPieces: 0,
      newInquiries: 0,
      failedEmails: 0,
    });
    expect(a.draftPages.map((p) => p.key).sort()).toEqual(["contact", "home_teaser", "privacy", "terms"]); // the About page was edited above
  });

  it("follows pieces, photos, settings and categories as they change", async () => {
    const draft = await admin.products.create({ title: "Draft thing" });
    const live = await admin.products.create({ title: "Live thing" });
    await admin.products.changeStatus({ productId: live.id, to: "AVAILABLE" });
    const held = await admin.products.create({ title: "Held thing" });
    await admin.products.changeStatus({ productId: held.id, to: "AVAILABLE" });
    await admin.products.changeStatus({ productId: held.id, to: "RESERVED", reason: "x" });
    const etsy = await admin.products.create({ title: "Etsy thing" });
    await admin.products.update({ productId: etsy.id, listedOnEtsy: true });
    await admin.products.changeStatus({ productId: etsy.id, to: "AVAILABLE" });
    await admin.products.changeStatus({ productId: etsy.id, to: "SOLD" });

    let a = await staff.site.attention();
    expect(a).toMatchObject({ draftPieces: 1, reservedPieces: 1, piecesNeedingPhotos: 4, publicPieces: 0, etsySoldToRemove: 1 });

    await admin.settings.update({ showProductsWithoutPhotos: true });
    a = await staff.site.attention();
    expect(a.publicPieces).toBe(3);

    await admin.settings.update({ sourcingStatement: "Every specimen is ethically sourced.", inquiryEmail: "" });
    const cat = (await admin.categories.list())[0]!;
    await admin.categories.update({ id: cat.id, description: "Real words." });
    a = await staff.site.attention();
    expect(a).toMatchObject({ sourcingPlaceholder: false, placeholderCategories: 7, contactMissing: true });
    await admin.categories.update({ id: (await admin.categories.list())[1]!.id, hidden: true });
    expect((await staff.site.attention()).placeholderCategories).toBe(6); // hidden categories don't count
    expect(draft.sku).toBeTruthy();
  });

  it("requires sign-in", async () => {
    expect((await rejection(as().site.attention())).code).toBe("UNAUTHORIZED");
  });
});
