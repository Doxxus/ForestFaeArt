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
let staffToken: string;
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

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const chunk = (type: string, data: number[]) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
/** A tiny structurally valid PNG with a text chunk that must be stripped. */
const png = (width = 64, height = 48) =>
  Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
    ...chunk("tEXt", [...[..."Comment\0GPSTEXT"].map((c) => c.charCodeAt(0))]),
    ...chunk("IDAT", [9, 9, 9, 9]),
    ...chunk("IEND", []),
  ]);

const upload = (productId: string, body: Uint8Array | string, opts: { token?: string | null; alt?: string; headers?: Record<string, string> } = {}) => {
  const headers = new Headers({ "content-type": "image/png", ...opts.headers });
  const token = opts.token === undefined ? adminToken : opts.token;
  if (token) headers.set("authorization", `Bearer ${token}`);
  const qs = new URLSearchParams({ productId, ...(opts.alt ? { alt: opts.alt } : {}) });
  return worker.fetch(new Request(`https://api.test/media/upload?${qs}`, { method: "POST", headers, body }), env);
};
const uploadedImage = async (res: Response) => ((await res.json()) as { image: { id: string; path: string; isPrimary: boolean; altText: string; width: number; height: number } }).image;

beforeAll(async () => {
  tdb = await createTestDb();
  db = makeDb(tdb.d1);
  env = { DB: tdb.d1, MEDIA: tdb.r2, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "http://localhost:3000" };
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "A", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "S", role: "STAFF", passwordHash: hash },
  ]);
  const login = async (email: string) => (await as().auth.login({ email, password: "correct horse battery staple" })).token;
  adminToken = await login("a@example.com");
  staffToken = await login("s@example.com");
  admin = as(adminToken);
  staff = as(staffToken);
  await admin.settings.update({ siteLive: true });
}, 60_000);
afterAll(async () => {
  await tdb?.dispose();
});

const newProduct = async (title: string, extra: { status?: "AVAILABLE" } = { status: "AVAILABLE" }) => {
  const p = await admin.products.create({ title, priceCents: 5000, costCents: 1500 });
  if (extra.status) await admin.products.changeStatus({ productId: p.id, to: extra.status });
  return p;
};

describe("uploading photos", () => {
  it("needs a signed-in user and a product", async () => {
    const p = await newProduct("Upload auth");
    expect((await upload(p.id, png(), { token: null })).status).toBe(401);
    expect((await upload(p.id, png(), { token: "garbage" })).status).toBe(401);
    expect((await upload("nope", png())).status).toBe(404);
    expect((await worker.fetch(new Request("https://api.test/media/upload"), env)).status).toBe(405);
  });

  it("stores a cleaned photo, makes the first one primary, and lists them in order", async () => {
    const p = await newProduct("Luna Moth");
    const first = await upload(p.id, png(64, 48), { token: staffToken, alt: "A pale green moth" });
    expect(first.status).toBe(201);
    const a = await uploadedImage(first);
    expect(a).toMatchObject({ isPrimary: true, altText: "A pale green moth", width: 64, height: 48 });
    expect(a.path).toMatch(new RegExp(`^/media/products/${p.id}/[0-9A-Z]{26}\\.png$`));

    const b = await uploadedImage(await upload(p.id, png(10, 20)));
    expect(b).toMatchObject({ isPrimary: false, altText: "Luna Moth" }); // default alt text from the title (IMG-5)
    expect((await staff.images.list({ productId: p.id })).map((i) => i.id)).toEqual([a.id, b.id]);

    const stored = await tdb.r2.get(a.path.replace("/media/", ""));
    const bytes = new Uint8Array(await stored!.arrayBuffer());
    expect(String.fromCharCode(...bytes)).not.toContain("GPSTEXT");
    expect(stored!.httpMetadata?.contentType).toBe("image/png");
  });

  it("rejects files that are not photos, whatever they claim to be", async () => {
    const p = await newProduct("Bad uploads");
    const html = await upload(p.id, "<html><script>alert(1)</script></html>", { headers: { "content-type": "image/jpeg" } });
    expect(html.status).toBe(400);
    expect(((await html.json()) as { error: string }).error).toMatch(/JPEG, PNG or WebP/);
    expect((await upload(p.id, new Uint8Array(0))).status).toBe(400);
    expect((await upload(p.id, "<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>", { headers: { "content-type": "image/svg+xml" } })).status).toBe(400);
    expect((await upload(p.id, png(), { headers: { "content-length": String(50 * 1024 * 1024) } })).status).toBe(413);
    expect(await staff.images.list({ productId: p.id })).toEqual([]);
  });

  it("limits the number of photos per piece", async () => {
    const p = await newProduct("Many photos");
    for (let i = 0; i < 12; i++) expect((await upload(p.id, png())).status).toBe(201);
    const over = await upload(p.id, png());
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: string }).error).toMatch(/up to 12/);
  }, 30_000);
});

describe("managing photos", () => {
  it("changes the primary photo, alt text and order, and rejects stale lists", async () => {
    const p = await newProduct("Manage photos");
    const [a, b, c] = [await uploadedImage(await upload(p.id, png())), await uploadedImage(await upload(p.id, png())), await uploadedImage(await upload(p.id, png()))];

    await staff.images.setPrimary({ productId: p.id, imageId: c!.id });
    expect((await staff.images.list({ productId: p.id })).map((i) => [i.id, i.isPrimary])).toEqual([[a!.id, false], [b!.id, false], [c!.id, true]]);

    await staff.images.reorder({ productId: p.id, imageIds: [c!.id, a!.id, b!.id] });
    expect((await staff.images.list({ productId: p.id })).map((i) => i.id)).toEqual([c!.id, a!.id, b!.id]);
    expect((await rejection(staff.images.reorder({ productId: p.id, imageIds: [c!.id, a!.id] }))).code).toBe("BAD_REQUEST");
    expect((await rejection(staff.images.reorder({ productId: p.id, imageIds: [c!.id, a!.id, a!.id] }))).code).toBe("BAD_REQUEST");

    await staff.images.setAlt({ productId: p.id, imageId: a!.id, altText: "  Front view  " });
    expect((await staff.images.list({ productId: p.id })).find((i) => i.id === a!.id)?.altText).toBe("Front view");
    expect((await rejection(staff.images.setPrimary({ productId: p.id, imageId: "nope" }))).code).toBe("NOT_FOUND");
  });

  it("will not touch a photo through the wrong product", async () => {
    const p1 = await newProduct("Owner one");
    const p2 = await newProduct("Owner two");
    const img = await uploadedImage(await upload(p1.id, png()));
    expect((await rejection(staff.images.delete({ productId: p2.id, imageId: img.id }))).code).toBe("NOT_FOUND");
    expect((await rejection(staff.images.setAlt({ productId: p2.id, imageId: img.id, altText: "x" }))).code).toBe("NOT_FOUND");
  });

  it("deleting the primary promotes the next photo and removes the file", async () => {
    const p = await newProduct("Delete photos");
    const a = await uploadedImage(await upload(p.id, png()));
    const b = await uploadedImage(await upload(p.id, png()));
    await staff.images.delete({ productId: p.id, imageId: a.id });
    expect(await tdb.r2.get(a.path.replace("/media/", ""))).toBeNull();
    expect((await staff.images.list({ productId: p.id })).map((i) => [i.id, i.isPrimary])).toEqual([[b.id, true]]);
    await staff.images.delete({ productId: p.id, imageId: b.id });
    expect(await staff.images.list({ productId: p.id })).toEqual([]);
  });

  it("requires sign-in", async () => {
    expect((await rejection(as().images.list({ productId: "x" }))).code).toBe("UNAUTHORIZED");
  });
});

describe("serving photos", () => {
  let path: string;
  beforeAll(async () => {
    const p = await newProduct("Serve photos");
    path = (await uploadedImage(await upload(p.id, png()))).path;
  });
  const get = (url: string, headers: Record<string, string> = {}, e: Env = env) => worker.fetch(new Request(`https://api.test${url}`, { headers }), e);

  it("serves the original with long-lived caching and no sniffing", async () => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(30);
  });

  it("returns 404 for anything that is not a stored photo key", async () => {
    expect((await get("/media/products/NOPE/NOPE.png")).status).toBe(404);
    expect((await get("/media/../secrets.txt")).status).toBe(404);
    expect((await get("/media/products/%2e%2e/x.png")).status).toBe(404);
    expect((await get(path.replace(/\.png$/, ".gif"))).status).toBe(404);
    expect((await get(`/media/products/${"0".repeat(26)}/${"0".repeat(26)}.png`)).status).toBe(404);
  });

  it("rejects a bad width and serves the original when resizing is unavailable", async () => {
    expect((await get(`${path}?w=abc`)).status).toBe(400);
    expect((await get(`${path}?w=0`)).status).toBe(400);
    expect((await get(`${path}?w=640`)).status).toBe(200);
  });

  it("resizes to an offered width and the best format the browser accepts", async () => {
    const calls: { transform?: unknown; output?: unknown } = {};
    const images = {
      input: () => ({
        transform: (t: unknown) => {
          calls.transform = t;
          return { output: async (o: { format: string }) => ((calls.output = o), { response: ({ headers }: { headers: HeadersInit }) => new Response("resized", { headers }), contentType: () => o.format }) };
        },
      }),
    } as unknown as ImagesBinding;
    const withImages = { ...env, IMAGES: images };

    const res = await get(`${path}?w=500`, { accept: "image/avif,image/webp,*/*" }, withImages);
    expect(await res.text()).toBe("resized");
    expect(calls.transform).toEqual({ width: 640, fit: "scale-down" });
    expect(calls.output).toMatchObject({ format: "image/avif" });
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("vary")).toBe("Accept");

    await get(`${path}?w=99999`, { accept: "image/webp" }, withImages);
    expect(calls.transform).toEqual({ width: 1920, fit: "scale-down" });
    expect(calls.output).toMatchObject({ format: "image/webp" });
    await get(`${path}?w=320`, { accept: "*/*" }, withImages);
    expect(calls.output).toMatchObject({ format: "image/png" });
  });

  it("falls back to the original if resizing fails", async () => {
    const broken = { input: () => ({ transform: () => ({ output: async () => { throw new Error("boom"); } }) }) } as unknown as ImagesBinding;
    const res = await get(`${path}?w=640`, {}, { ...env, IMAGES: broken });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});

describe("inventory list and dashboard", () => {
  it("finds the pieces that need photos, and the queue shrinks as photos arrive", async () => {
    const withPhoto = await newProduct("Has photo piece");
    const without = await newProduct("Needs photo piece");
    await upload(withPhoto.id, png());
    const queue = await staff.products.list({ hasPhoto: false, q: "piece" });
    expect(queue.items.map((i) => i.id)).toEqual([without.id]);
    expect(queue.items[0]).toMatchObject({ imageCount: 0, thumbnailPath: null });
    const done = await staff.products.list({ hasPhoto: true, q: "piece" });
    expect(done.items[0]).toMatchObject({ id: withPhoto.id, imageCount: 1 });
    expect(done.items[0]!.thumbnailPath).toMatch(/^\/media\/products\//);
  });

  it("searches title and SKU, safely handles wildcard characters, and filters by status and category", async () => {
    const a = await newProduct("Rare 100% Cotton Moth");
    await newProduct("Plain beetle");
    expect((await staff.products.list({ q: "100%" })).items.map((i) => i.id)).toEqual([a.id]);
    expect((await staff.products.list({ q: "%" })).items.map((i) => i.id)).toEqual([a.id]);
    expect((await staff.products.list({ q: "_" })).total).toBe(0);
    expect((await staff.products.list({ q: a.sku.toLowerCase() })).items.map((i) => i.id)).toEqual([a.id]);

    const draft = await newProduct("Draft piece zzz", {});
    expect((await staff.products.list({ q: "zzz", status: ["DRAFT"] })).items.map((i) => i.id)).toEqual([draft.id]);
    expect((await staff.products.list({ q: "zzz", status: ["AVAILABLE"] })).total).toBe(0);

    const [moth] = (await admin.categories.list()).filter((c) => c.slug === "moth");
    await staff.products.setCategories({ productId: a.id, categoryIds: [moth!.id] });
    expect((await staff.products.list({ categoryId: moth!.id })).items.map((i) => i.id)).toEqual([a.id]);
  });

  it("hides archived pieces unless asked, sorts, and pages", async () => {
    const p = await newProduct("Aaa sort first");
    await newProduct("Zzz sort last");
    await admin.products.changeStatus({ productId: p.id, to: "ARCHIVED" });
    expect((await staff.products.list({ q: "sort" })).items.map((i) => i.title)).toEqual(["Zzz sort last"]);
    expect((await staff.products.list({ q: "sort", includeArchived: true, sort: "title" })).items.map((i) => i.title)).toEqual(["Aaa sort first", "Zzz sort last"]);
    expect((await staff.products.list({ q: "sort", includeArchived: true, sort: "title", limit: 1, offset: 1 })).items.map((i) => i.title)).toEqual(["Zzz sort last"]);
    expect((await staff.products.list({ q: "sort", includeArchived: true, limit: 1 })).total).toBe(2);
  });

  it("never returns cost to STAFF in the list", async () => {
    const { items } = await staff.products.list({ q: "Plain" });
    expect(items.length).toBeGreaterThan(0);
    expect(JSON.stringify(items)).not.toMatch(/costCents|1500/);
    expect((await admin.products.list({ q: "Plain" })).items[0]).toHaveProperty("costCents", 1500);
  });

  it("gives STAFF counts only and ADMIN counts plus totals", async () => {
    const e = await newProduct("Etsy sold piece");
    await admin.products.update({ productId: e.id, listedOnEtsy: true });
    await admin.products.changeStatus({ productId: e.id, to: "SOLD" });

    const s = await staff.inventory.summary();
    expect(s.byStatus.SOLD).toBeGreaterThanOrEqual(1);
    expect(s.etsySoldToRemove).toBe(1);
    expect(s.needsPhotos).toBeGreaterThan(0);
    expect("totalValueCents" in s).toBe(false);
    expect("totalCostCents" in s).toBe(false);

    const a = await admin.inventory.summary();
    expect(a).toHaveProperty("totalValueCents");
    expect(a).toHaveProperty("totalCostCents");
    const stocked = (await admin.products.list({ status: ["AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"], limit: 100 })).items;
    const value = stocked.reduce((n, p) => n + p.priceCents * p.quantity, 0);
    expect(a).toMatchObject({ totalValueCents: value });
    expect((await rejection(as().inventory.summary())).code).toBe("UNAUTHORIZED");
  });
});

describe("photos on the public site", () => {
  it("shows the primary photo in lists and every photo on the piece page", async () => {
    const p = await newProduct("Public photos");
    const a = await uploadedImage(await upload(p.id, png(30, 40), { alt: "Front" }));
    const b = await uploadedImage(await upload(p.id, png(50, 60), { alt: "Side" }));
    await admin.products.setCategories({ productId: p.id, categoryIds: [] });

    const list = await as().catalog.list({ limit: 60 });
    const item = list.items.find((i) => i.sku === p.sku)!;
    expect(item.image).toEqual({ path: a.path, altText: "Front", width: 30, height: 40 });

    const page = await as().catalog.get({ skuOrSlug: p.sku });
    expect(page.images.map((i) => i.path)).toEqual([a.path, b.path]);
    expect(JSON.stringify(page)).not.toMatch(/r2Key|costCents|byteSize|contentType/);
  });
});
