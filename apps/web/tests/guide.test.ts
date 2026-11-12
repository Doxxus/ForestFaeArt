import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKET_DAY, OWNER_GUIDE, STAFF_QUICK_START } from "../lib/guide";

const publicDir = join(import.meta.dirname, "../public/guide");
const lines = () => [
  ...OWNER_GUIDE.flatMap((s) => [s.title, s.intro, ...(s.steps ?? []), ...(s.tips ?? []), s.shot?.alt ?? ""]),
  STAFF_QUICK_START.intro,
  ...STAFF_QUICK_START.steps,
  ...STAFF_QUICK_START.oops,
  ...STAFF_QUICK_START.never,
  MARKET_DAY.intro,
  ...MARKET_DAY.before,
  ...MARKET_DAY.during,
  ...MARKET_DAY.after,
];

describe("the Owner Guide, staff quick-start and market-day checklist (HAND-5)", () => {
  it("covers what the requirements ask for", () => {
    const ids = OWNER_GUIDE.map((s) => s.id);
    for (const id of ["products", "photos", "stock", "events", "labels", "selling", "inquiries", "wrong", "who"]) expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says plainly who holds the domain and the hosting (HAND-8)", () => {
    const who = OWNER_GUIDE.find((s) => s.id === "who")!;
    const text = [who.intro, ...(who.steps ?? [])].join(" ");
    expect(text).toMatch(/forestfae\.ca/);
    expect(text).toMatch(/developer currently holds and pays/);
    expect(text).toMatch(/passed to you/);
  });

  it("is written in everyday words: no developer or accounting jargon", () => {
    const text = lines().join("\n");
    for (const word of ["SKU", "API", "tRPC", "idempot", "D1", "R2", "slug", "JSON", "CSV", "endpoint", "database", "Worker", "ledger", "migration", "Cloudflare", "cron"]) {
      expect(text.includes(word), `the guide uses "${word}"`).toBe(false);
    }
  });

  it("never mentions things the owner doesn't have yet", () => {
    expect(lines().join("\n")).not.toMatch(/square|etsy sync|stripe|turnstile/i);
  });

  it("keeps every line short and tidy", () => {
    for (const line of lines()) {
      expect(line.length, `too long: ${line.slice(0, 40)}…`).toBeLessThanOrEqual(420);
      expect(line.trim()).toBe(line);
    }
  });

  it("keeps the staff quick-start to one sheet of paper", () => {
    const count = STAFF_QUICK_START.steps.length + STAFF_QUICK_START.oops.length + STAFF_QUICK_START.never.length;
    expect(count).toBeLessThanOrEqual(16);
  });

  it("has a picture file for every screenshot, with a description", () => {
    for (const s of OWNER_GUIDE.filter((x) => x.shot)) {
      expect(existsSync(join(publicDir, s.shot!.file)), `missing public/guide/${s.shot!.file}`).toBe(true);
      expect(s.shot!.alt.length).toBeGreaterThan(15);
    }
  });
});
