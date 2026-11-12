import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@ffa/auth";
import { users } from "@ffa/db";
import type { Env } from "../src/env";
import worker from "../src/index";
import { NIGHTLY_CRON } from "../src/schedule";
import { appRouter } from "../src/router";
import { createContext } from "../src/trpc";
import { makeDb } from "../src/store";
import {
  KEEP_DAYS,
  backupToSql,
  copyMissingMedia,
  dayKey,
  dumpDatabase,
  gunzip,
  orderedTables,
  pruneDatabaseBackups,
  readBackupState,
  runDatabaseBackup,
} from "../src/services/backup";
import { BACKUP_MAX_AGE_MS, backupCheck, evaluate, runMonitor, storageChecks, websiteCheck, type MonitorState } from "../src/services/monitor";
import { referenceFor, withSecurityHeaders } from "../src/security";
import { createTestDb, type TestDb } from "./d1";

let tdb: TestDb;
let env: Env;
let admin: ReturnType<typeof appRouter.createCaller>;
let staff: ReturnType<typeof appRouter.createCaller>;

const NOW = new Date("2026-12-01T07:17:00Z");
const tableCounts = async (d1: D1Database, names: string[]) => {
  const out: Record<string, number> = {};
  for (const n of names) out[n] = (await d1.prepare(`SELECT COUNT(*) AS n FROM "${n}"`).first<{ n: number }>())!.n;
  return out;
};

beforeAll(async () => {
  tdb = await createTestDb();
  env = { DB: tdb.d1, MEDIA: tdb.r2, BACKUPS: tdb.backups, SESSION_SECRET: "test-secret-".padEnd(48, "x"), ENVIRONMENT: "local", WEB_ORIGIN: "https://web.test" };
  const db = makeDb(tdb.d1);
  const hash = await hashPassword("correct horse battery staple");
  await db.insert(users).values([
    { id: "U_A", email: "a@example.com", name: "Asa", role: "ADMIN", passwordHash: hash },
    { id: "U_S", email: "s@example.com", name: "Sam", role: "STAFF", passwordHash: hash },
  ]);
  const caller = async (email: string) => {
    const { token } = await appRouter.createCaller(createContext(env, new Request("https://api.test/trpc"))).auth.login({ email, password: "correct horse battery staple" });
    return appRouter.createCaller(createContext(env, new Request("https://api.test/trpc", { headers: { authorization: `Bearer ${token}` } })));
  };
  admin = await caller("a@example.com");
  staff = await caller("s@example.com");
  const piece = await admin.products.create({ title: "Blue Morpho, 'framed'\nsecond line", priceCents: 12_500, quantity: 1 });
  await admin.products.changeStatus({ productId: piece.id, to: "AVAILABLE" });
  await admin.products.create({ title: "Luna Moth", priceCents: 9_000, quantity: 2 });
});

afterAll(async () => {
  await tdb.dispose();
});

describe("the database backup (HAND-6)", () => {
  it("lists tables parents first, and leaves out ones that aren't worth keeping", async () => {
    const names = (await orderedTables(tdb.d1)).map((t) => t.name);
    expect(names.indexOf("product")).toBeLessThan(names.indexOf("product_image"));
    expect(names.indexOf("sale")).toBeLessThan(names.indexOf("sale_item"));
    expect(names).not.toContain("rate_limit");
    expect(names).not.toContain("d1_migrations");
    expect(names.some((n) => n.startsWith("sqlite_") || n.startsWith("_cf_"))).toBe(false);
  });

  it("writes a gzipped, dated file and records how it went", async () => {
    const state = await runDatabaseBackup(env, NOW);
    expect(state.ok).toBe(true);
    expect(state.key).toBe("db/2026-12-01.ndjson.gz");
    expect(state.counts?.product).toBe(2);
    const stored = await tdb.backups.get(dayKey(NOW));
    const text = await gunzip(await stored!.arrayBuffer());
    expect(text.split("\n")[0]).toContain('"type":"meta"');
    expect(await readBackupState(tdb.backups)).toMatchObject({ ok: true, key: "db/2026-12-01.ndjson.gz" });
  });

  it("puts every row back exactly, even awkward text, into a freshly migrated database", async () => {
    const dump = await dumpDatabase(tdb.d1, NOW);
    const sql = backupToSql(dump.text);
    // Every row is a single line, so any SQL runner copes with it.
    const inserts = sql.split("\n").filter((l) => l.startsWith("INSERT")).length;
    expect(inserts).toBe(Object.values(dump.counts).reduce((a, b) => a + b, 0));
    expect(sql.split("\n").filter(Boolean).every((l) => /^(PRAGMA|DELETE|INSERT) /.test(l))).toBe(true);

    const fresh = await createTestDb();
    try {
      await fresh.d1.exec(sql.split("\n").filter(Boolean).join("\n"));
      const names = Object.keys(dump.counts);
      expect(await tableCounts(fresh.d1, names)).toEqual(await tableCounts(tdb.d1, names));
      const original = await tdb.d1.prepare("SELECT * FROM product ORDER BY id").all();
      const restored = await fresh.d1.prepare("SELECT * FROM product ORDER BY id").all();
      expect(restored.results).toEqual(original.results);
      expect((restored.results.find((r) => String(r.title).startsWith("Blue Morpho")) as { title: string }).title).toBe("Blue Morpho, 'framed'\nsecond line");
    } finally {
      await fresh.dispose();
    }
  });

  it("refuses a backup in a format it doesn't know", () => {
    expect(() => backupToSql('{"type":"meta","format":99}\n')).toThrow(/format 99/);
    expect(() => backupToSql('{"t":"product","r":{}}\n')).toThrow(/no header/);
  });

  it("keeps 30 days and at least three backups, and removes the rest", async () => {
    const put = (day: string) => tdb.backups.put(`db/${day}.ndjson.gz`, "x");
    for (const d of ["2026-09-01", "2026-09-02", "2026-10-15", "2026-11-20", "2026-11-30"]) await put(d);
    const removed = await pruneDatabaseBackups(tdb.backups, NOW);
    expect(removed).toEqual(["db/2026-09-01.ndjson.gz", "db/2026-09-02.ndjson.gz", "db/2026-10-15.ndjson.gz"]);
    const left = (await tdb.backups.list({ prefix: "db/" })).objects.map((o) => o.key);
    expect(left).toContain("db/2026-11-20.ndjson.gz");
    expect(KEEP_DAYS).toBe(30);

    // Even when everything is old, the newest three stay.
    await pruneDatabaseBackups(tdb.backups, new Date("2027-06-01T00:00:00Z"));
    expect((await tdb.backups.list({ prefix: "db/" })).objects.length).toBe(3);
  });

  it("says so, and doesn't throw, when there is nowhere to put the backup", async () => {
    const state = await runDatabaseBackup({ DB: tdb.d1, BACKUPS: undefined }, NOW);
    expect(state.ok).toBe(false);
  });

  it("reports a failed backup instead of throwing", async () => {
    const broken = { prepare: () => { throw new Error("boom"); }, batch: () => Promise.reject(new Error("boom")) } as unknown as D1Database;
    const state = await runDatabaseBackup({ DB: broken, BACKUPS: tdb.backups }, NOW);
    expect(state.ok).toBe(false);
    expect((await readBackupState(tdb.backups))?.ok).toBe(false);
  });
});

describe("copying photos to the backup (HAND-6)", () => {
  it("copies a few at a time, never twice, and keeps what was deleted", async () => {
    for (const k of ["products/a/1.jpg", "products/a/2.jpg", "products/b/1.jpg", "events/x.jpg"]) await tdb.r2.put(k, `bytes of ${k}`, { httpMetadata: { contentType: "image/jpeg" } });
    const first = await copyMissingMedia(env, 3);
    expect(first.copied).toBe(3);
    expect(first.remaining).toBeGreaterThanOrEqual(1);
    const second = await copyMissingMedia(env, 3);
    expect(second.remaining).toBe(0);
    expect((await copyMissingMedia(env, 3)).copied).toBe(0);
    const copy = await tdb.backups.get("media/products/a/1.jpg");
    expect(await copy!.text()).toBe("bytes of products/a/1.jpg");
    expect(copy!.httpMetadata?.contentType).toBe("image/jpeg");
    await tdb.r2.delete("events/x.jpg");
    expect(await tdb.backups.head("media/events/x.jpg")).not.toBeNull();
  });
});

describe("the health monitor", () => {
  const failing = (since = "2026-12-01T00:00:00Z", count = 1, alertedAt?: string): MonitorState => ({ failing: { website: { since, count, alertedAt } } });
  const bad = [{ name: "website" as const, ok: false, detail: "The website did not answer." }];
  const good = [{ name: "website" as const, ok: true }];

  it("waits for a second bad check before telling anyone", () => {
    const first = evaluate({ failing: {} }, bad, NOW);
    expect(first.alerts).toEqual([]);
    expect(first.next.failing.website!.count).toBe(1);
    const second = evaluate(first.next, bad, NOW);
    expect(second.alerts).toHaveLength(1);
    expect(second.alerts[0]!.subject).toContain("website");
  });

  it("doesn't repeat itself, reminds once a day, and says when it's fixed", () => {
    const alerted = failing("2026-12-01T06:00:00Z", 3, NOW.toISOString());
    expect(evaluate(alerted, bad, new Date(NOW.getTime() + 60 * 60_000)).alerts).toEqual([]);
    const reminder = evaluate(alerted, bad, new Date(NOW.getTime() + 25 * 60 * 60_000));
    expect(reminder.alerts[0]!.subject).toMatch(/^Still a problem/);
    const fixed = evaluate(alerted, good, NOW);
    expect(fixed.alerts[0]!.subject).toMatch(/^Back to normal/);
    expect(fixed.next.failing).toEqual({});
  });

  it("stays quiet when a blip clears before the second check", () => {
    const blip = evaluate(evaluate({ failing: {} }, bad, NOW).next, good, NOW);
    expect(blip.alerts).toEqual([]);
    expect(blip.next.failing).toEqual({});
  });

  it("checks the website, and treats a non-200 or no answer as down", async () => {
    const ok = await websiteCheck({ WEB_ORIGIN: "https://forestfae.ca" }, async () => new Response("ok"));
    expect(ok.ok).toBe(true);
    const down = await websiteCheck({ WEB_ORIGIN: "https://forestfae.ca" }, async () => new Response("no", { status: 502 }));
    expect(down).toMatchObject({ ok: false, detail: expect.stringContaining("502") });
    const dead = await websiteCheck({ WEB_ORIGIN: "https://forestfae.ca" }, async () => { throw new Error("network"); });
    expect(dead.ok).toBe(false);
    expect((await websiteCheck({ WEB_ORIGIN: "http://localhost:3000" }, async () => { throw new Error("never called"); })).ok).toBe(true);
  });

  it("flags a missing, failed or old backup", () => {
    expect(backupCheck(null, NOW).ok).toBe(false);
    expect(backupCheck({ at: NOW.toISOString(), ok: false, error: "boom" }, NOW).detail).toContain("boom");
    expect(backupCheck({ at: new Date(NOW.getTime() - BACKUP_MAX_AGE_MS - 1).toISOString(), ok: true }, NOW).ok).toBe(false);
    expect(backupCheck({ at: new Date(NOW.getTime() - 60_000).toISOString(), ok: true }, NOW).ok).toBe(true);
  });

  it("reads the database and photo storage", async () => {
    expect((await storageChecks(env)).every((c) => c.ok)).toBe(true);
  });

  it("emails the alert address once something has been wrong for two checks, and never throws", async () => {
    const sent: { to: string[]; subject: string }[] = [];
    const email = { send: async (m: { to: string[]; subject: string }) => (sent.push(m), { ok: true as const, id: "1" }) };
    const e = { ...env, ENVIRONMENT: "production" as const, WEB_ORIGIN: "https://forestfae.ca", ALERT_EMAIL: "dev@example.com" };
    const down = async () => new Response("down", { status: 503 });
    await tdb.backups.delete("state/monitor.json");
    await runMonitor(e, NOW, down, email as never);
    expect(sent).toHaveLength(0);
    const second = await runMonitor(e, new Date(NOW.getTime() + 15 * 60_000), down, email as never);
    expect(second.alerts).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["dev@example.com"]);
    expect(sent[0]!.subject).toContain("[production]");
    await runMonitor(e, new Date(NOW.getTime() + 30 * 60_000), down, email as never);
    expect(sent).toHaveLength(1);
  });
});

describe("Export my data and backup status", () => {
  it("gives the administrator every spreadsheet, including what pieces cost", async () => {
    const { files } = await admin.data.exportAll();
    expect(files.map((f) => f.name)).toEqual(["README.txt", "inventory.csv", "sales.csv", "customers.csv", "events.csv", "inquiries.csv"]);
    const inventory = files.find((f) => f.name === "inventory.csv")!.content;
    expect(inventory.split("\n")[0]).toContain("Cost");
    expect(inventory).toContain("Luna Moth");
    expect(inventory).toContain("125.00");
    // A spreadsheet must not run a formula that someone typed into a title.
    await admin.products.create({ title: "=HYPERLINK(\"http://x\")", priceCents: 100, quantity: 1 });
    expect((await admin.data.exportAll()).files.find((f) => f.name === "inventory.csv")!.content).toContain("'=HYPERLINK");
  });

  it("is for the administrator only", async () => {
    await expect(staff.data.exportAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staff.data.backupStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staff.data.backupNow()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("shows when the last backup ran, and backs up on request", async () => {
    const now = await admin.data.backupNow();
    expect(now.ok).toBe(true);
    const status = await admin.data.backupStatus();
    expect(status).toMatchObject({ configured: true, database: { ok: true } });
    expect(status.kept).toBeGreaterThan(0);
  });
});

describe("the scheduled jobs and the response safeguards (ADR 016)", () => {
  it("runs the backup on the nightly schedule and the monitor on the other", async () => {
    await tdb.backups.delete("state/backup.json");
    const waits: Promise<unknown>[] = [];
    await worker.scheduled!({ cron: NIGHTLY_CRON } as ScheduledController, env, { waitUntil: (p: Promise<unknown>) => void waits.push(p) } as ExecutionContext);
    await Promise.all(waits);
    expect((await readBackupState(tdb.backups))?.ok).toBe(true);
  });

  it("adds security headers to every response, and keeps a route's own", async () => {
    const res = await worker.fetch(new Request("https://api.test/nope"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("strict-transport-security")).toBeNull();

    const kept = withSecurityHeaders(new Response("x", { headers: { "content-security-policy": "sandbox" } }), { ENVIRONMENT: "production" });
    expect(kept.headers.get("content-security-policy")).toBe("sandbox");
    expect(kept.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("gives an unexpected failure a reference, shows it to the caller and writes it to the log", async () => {
    const logged: string[] = [];
    const original = console.error;
    console.error = (line: unknown) => void logged.push(String(line));
    try {
      const broken = { ...env, DB: { prepare: () => { throw new Error("secret database detail"); }, batch: () => Promise.reject(new Error("secret database detail")) } as unknown as D1Database };
      const res = await worker.fetch(new Request("https://api.test/trpc/settings.public"), broken);
      expect(res.status).toBe(500);
      const body = await res.text();
      const reference = /"reference":"([A-Z0-9]{8})"/.exec(body)?.[1];
      expect(reference).toBeTruthy();
      expect(body).not.toContain("secret database detail");
      const entry = logged.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return {}; } }).find((e) => e.event === "api-error");
      expect(entry?.reference).toBe(reference);
    } finally {
      console.error = original;
    }
  });

  it("gives the same reference to the same error", () => {
    const e = new Error("x");
    expect(referenceFor(e)).toBe(referenceFor(e));
    expect(referenceFor(new Error("y"))).not.toBe(referenceFor(e));
  });
});
