import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";

const MIGRATIONS = join(import.meta.dirname, "../../../packages/db/migrations");
const WRANGLER_CONFIG = join(import.meta.dirname, "../wrangler.jsonc");

/** Split a migration file into single statements. Handles drizzle breakpoints and trigger bodies (BEGIN ... END;). */
export function splitStatements(sqlText: string): string[] {
  const out: string[] = [];
  for (const chunk of sqlText.split("--> statement-breakpoint")) {
    let current = "";
    for (const line of chunk.split("\n")) {
      if (/^\s*--/.test(line) && !current) continue;
      current += line + "\n";
      const inTrigger = /\bBEGIN\b/i.test(current);
      const done = inTrigger ? /\bEND;\s*$/i.test(current) : /;\s*$/.test(current);
      if (done) {
        out.push(current.trim());
        current = "";
      }
    }
    if (current.trim()) out.push(current.trim());
  }
  return out;
}

export interface TestDb {
  d1: D1Database;
  r2: R2Bucket;
  dispose(): Promise<void>;
}

/** A fresh in-memory D1 (real workerd/SQLite semantics, nothing persisted) with every migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const proxy = await getPlatformProxy<{ DB: D1Database; MEDIA: R2Bucket }>({ configPath: WRANGLER_CONFIG, persist: false });
  const d1 = proxy.env.DB;
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    for (const statement of splitStatements(readFileSync(join(MIGRATIONS, file), "utf8"))) {
      await d1.prepare(statement).run();
    }
  }
  return { d1, r2: proxy.env.MEDIA, dispose: () => proxy.dispose() };
}
