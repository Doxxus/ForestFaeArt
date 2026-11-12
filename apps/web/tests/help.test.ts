import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS, helpFor } from "../lib/help";

const adminDir = join(import.meta.dirname, "../app/admin");

/** The address of every page under app/admin, with each [name] filled in with an example. */
function adminRoutes(dir = adminDir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...adminRoutes(path));
    else if (entry === "page.tsx") {
      const route = "/admin/" + relative(adminDir, dir).split(sep).join("/");
      out.push(route.replace(/\/$/, "").replace(/\[[^\]]+\]/g, "example"));
    }
  }
  return out;
}

describe("the in-app help (ADM-1)", () => {
  it("has its own help for every admin page, not just the general fallback", () => {
    const routes = adminRoutes();
    expect(routes.length).toBeGreaterThan(20);
    const fallback = helpFor("/admin/not-a-real-page");
    for (const route of routes) expect(helpFor(route), `no help written for ${route}`).not.toBe(fallback);
  });

  it("gives each page a different title, so the drawer says what you are looking at", () => {
    const titles = HELP_TOPICS.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("picks the most specific page, whatever follows the address", () => {
    expect(helpFor("/admin/products/new").title).toBe("Adding a piece");
    expect(helpFor("/admin/products/FFA-000012").title).toBe("A piece");
    expect(helpFor("/admin/products").title).toBe("Products");
    expect(helpFor("/admin/events/spring-fair/wrap-up").title).toBe("Wrapping up an event");
    expect(helpFor("/admin/events/spring-fair").title).toBe("An event");
    expect(helpFor("/admin/labels/templates").title).toBe("Label layouts");
    expect(helpFor("/admin/settings?saved=1").title).toBe("Settings");
    expect(helpFor("/admin").title).toBe("Your dashboard");
  });

  it("is written in everyday words: no developer or accounting jargon", () => {
    const text = JSON.stringify(HELP_TOPICS);
    for (const word of ["SKU", "API", "tRPC", "idempot", "D1", "R2", "slug", "JSON", "CSV", "endpoint", "database", "Worker", "ledger", "migration"]) {
      expect(text.includes(word), `the help uses "${word}"`).toBe(false);
    }
  });

  it("never mentions things the owner doesn't have yet", () => {
    const text = JSON.stringify(HELP_TOPICS);
    expect(text).not.toMatch(/square|etsy sync|stripe|turnstile/i);
  });

  it("keeps every line short enough to read in a narrow drawer", () => {
    for (const topic of HELP_TOPICS) {
      for (const line of [topic.about, ...(topic.steps ?? []), ...(topic.tips ?? [])]) {
        expect(line.length, `too long: ${line.slice(0, 40)}…`).toBeLessThanOrEqual(360);
        expect(line.trim()).toBe(line);
      }
    }
  });
});
