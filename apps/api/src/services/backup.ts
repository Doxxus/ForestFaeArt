import type { Env } from "../env";

/**
 * Backups (HAND-6, ADR 016). Two things go to a separate R2 bucket that lives in the same Cloudflare account,
 * which becomes the owner's at Stage 2:
 *
 *   db/YYYY-MM-DD.ndjson.gz   every table's rows, one JSON object per line, in an order that restores cleanly
 *   media/<same key>          a copy of every photo and generated file in the media bucket
 *
 * D1's own Time Travel (30 days, to the minute) is the first line of defence for a bad change.
 * These files are the second: they survive a deleted database, and they can be read without Cloudflare.
 */

export const BACKUP_FORMAT = 1;
export const KEEP_DAYS = 30;
/** Always keep at least this many database backups, however old. */
export const KEEP_MINIMUM = 3;
const PAGE = 500;
/** Short-lived or rebuilt tables that are not worth keeping. Migrations are replayed from the repo on restore. */
const SKIP_TABLE = /^(sqlite_|_cf_|d1_migrations$|rate_limit$)/;

export interface TableInfo {
  name: string;
  withoutRowid: boolean;
}

/** Every table worth keeping, parents before children, so the rows can be put back in this order with foreign keys on. */
export async function orderedTables(d1: D1Database): Promise<TableInfo[]> {
  const listed = await d1.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all<{ name: string; sql: string }>();
  const all = listed.results.filter((t) => !SKIP_TABLE.test(t.name));
  const names = new Set(all.map((t) => t.name));
  // D1 doesn't offer PRAGMA foreign_key_list, so the links are read from each table's own CREATE statement.
  const parents = new Map<string, Set<string>>();
  for (const t of all) {
    for (const m of (t.sql ?? "").matchAll(/REFERENCES\s+[`"[]?(\w+)[`"\]]?/gi)) {
      const ref = m[1]!;
      if (ref !== t.name && names.has(ref)) (parents.get(t.name) ?? parents.set(t.name, new Set()).get(t.name)!).add(ref);
    }
  }
  const ordered: TableInfo[] = [];
  const done = new Set<string>();
  const visit = (name: string, trail: Set<string>) => {
    if (done.has(name) || trail.has(name)) return;
    trail.add(name);
    for (const p of [...(parents.get(name) ?? [])].sort()) visit(p, trail);
    done.add(name);
    ordered.push({ name, withoutRowid: /without\s+rowid/i.test(all.find((t) => t.name === name)!.sql ?? "") });
  };
  for (const t of all) visit(t.name, new Set());
  return ordered;
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export interface Dump {
  text: string;
  counts: Record<string, number>;
}

/** Reads every row of every kept table. Pages of 500 rows, one batch of queries per page, so it stays within D1's per-request limits. */
export async function dumpDatabase(d1: D1Database, now: Date = new Date()): Promise<Dump> {
  const tables = await orderedTables(d1);
  const counts: Record<string, number> = Object.fromEntries(tables.map((t) => [t.name, 0]));
  const lines: string[] = [];
  let pending = tables;
  for (let offset = 0; pending.length > 0; offset += PAGE) {
    const results = await d1.batch(
      pending.map((t) => d1.prepare(`SELECT * FROM ${quoteIdent(t.name)}${t.withoutRowid ? "" : " ORDER BY rowid"} LIMIT ${PAGE} OFFSET ${offset}`)),
    );
    const next: TableInfo[] = [];
    results.forEach((res, i) => {
      const table = pending[i]!;
      const rows = res.results as Record<string, unknown>[];
      for (const row of rows) lines.push(JSON.stringify({ t: table.name, r: row }));
      counts[table.name]! += rows.length;
      if (rows.length === PAGE) next.push(table);
    });
    pending = next;
  }
  const meta = JSON.stringify({ type: "meta", format: BACKUP_FORMAT, createdAt: now.toISOString(), tables: tables.map((t) => t.name), counts });
  return { text: [meta, ...lines].join("\n") + "\n", counts };
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function gunzip(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const stream = new Blob([bytes as unknown as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export const dayKey = (now: Date) => `db/${now.toISOString().slice(0, 10)}.ndjson.gz`;

export interface BackupState {
  at: string;
  ok: boolean;
  key?: string;
  bytes?: number;
  counts?: Record<string, number>;
  error?: string;
}

const STATE_KEY = "state/backup.json";

export async function readBackupState(backups: R2Bucket): Promise<BackupState | null> {
  const object = await backups.get(STATE_KEY);
  return object ? ((await object.json()) as BackupState) : null;
}

/** Writes today's database backup and removes old ones. Never throws: the outcome is recorded for the monitor and the admin to see. */
export async function runDatabaseBackup(env: Pick<Env, "DB" | "BACKUPS">, now: Date = new Date()): Promise<BackupState> {
  const backups = env.BACKUPS;
  if (!backups) return { at: now.toISOString(), ok: false, error: "No backup bucket is connected." };
  let state: BackupState;
  try {
    const dump = await dumpDatabase(env.DB, now);
    const body = await gzip(dump.text);
    const key = dayKey(now);
    await backups.put(key, body, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { format: String(BACKUP_FORMAT), rows: String(Object.values(dump.counts).reduce((a, b) => a + b, 0)) } });
    state = { at: now.toISOString(), ok: true, key, bytes: body.byteLength, counts: dump.counts };
    await pruneDatabaseBackups(backups, now);
  } catch (error) {
    console.error(JSON.stringify({ event: "backup-failed", message: String(error) }));
    state = { at: now.toISOString(), ok: false, error: String(error).slice(0, 300) };
  }
  await backups.put(STATE_KEY, JSON.stringify(state), { httpMetadata: { contentType: "application/json" } }).catch(() => undefined);
  return state;
}

/** Deletes backups older than KEEP_DAYS, but always keeps the newest few. */
export async function pruneDatabaseBackups(backups: R2Bucket, now: Date = new Date()): Promise<string[]> {
  const listed = await backups.list({ prefix: "db/", limit: 1000 });
  const keys = listed.objects.map((o) => o.key).sort();
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const removable = keys.slice(0, Math.max(0, keys.length - KEEP_MINIMUM)).filter((k) => k.slice(3, 13) < cutoff);
  if (removable.length) await backups.delete(removable);
  return removable;
}

async function listKeys(bucket: R2Bucket, prefix: string | undefined, max: number): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) keys.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && keys.length < max);
  return keys;
}

export interface MediaCopyReport {
  copied: number;
  remaining: number;
}

/**
 * Copies photos and generated files that aren't in the backup bucket yet, a few at a time. Cloudflare's free plan allows
 * 50 outside calls per run, so each run takes only `budget` files and the frequent monitor schedule catches up over time.
 * Files deleted from the media bucket are deliberately left in the backup.
 */
export async function copyMissingMedia(env: Pick<Env, "MEDIA" | "BACKUPS">, budget: number): Promise<MediaCopyReport> {
  if (!env.BACKUPS) return { copied: 0, remaining: 0 };
  const [source, target] = await Promise.all([listKeys(env.MEDIA, undefined, 20_000), listKeys(env.BACKUPS, "media/", 20_000)]);
  const have = new Set(target.map((k) => k.slice("media/".length)));
  const missing = source.filter((k) => !have.has(k));
  let copied = 0;
  for (const key of missing.slice(0, budget)) {
    const object = await env.MEDIA.get(key);
    if (!object) continue;
    await env.BACKUPS.put(`media/${key}`, object.body, { httpMetadata: object.httpMetadata, customMetadata: object.customMetadata });
    copied++;
  }
  return { copied, remaining: missing.length - copied };
}

// ---- restoring ----

const sqlValue = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  // Line breaks are written as char() calls so that every row stays on one line, which every SQL runner copes with.
  return `'${String(v).replaceAll("'", "''").replaceAll("\r", "' || char(13) || '").replaceAll("\n", "' || char(10) || '")}'`;
};

/**
 * Turns a backup's text into SQL that puts every row back, in the order it was written. Run it against a database that already has
 * the migrations applied and no rows. Used by scripts/restore-backup.ts, and by the tests to prove a backup really restores.
 */
export function backupToSql(text: string): string {
  // Rows are written parents first, but a table that points at itself can still need its checks put off until the end.
  const out: string[] = ["PRAGMA defer_foreign_keys = on;"];
  const lines = text.split("\n").filter((l) => l.trim());
  const meta = lines.length ? (JSON.parse(lines[0]!) as { type?: string; format?: number; tables?: string[] }) : {};
  if (meta.type !== "meta") throw new Error("This doesn't look like a backup file (it has no header).");
  if (meta.format !== BACKUP_FORMAT) throw new Error(`This backup is format ${meta.format}, and this tool reads format ${BACKUP_FORMAT}.`);
  // The migrations seed a few reference tables (categories, fields, counters). Clear them so the backup's own copy goes in.
  // The append-only rules still stop this from clearing a database that holds real history.
  for (const table of [...(meta.tables ?? [])].reverse()) out.push(`DELETE FROM ${quoteIdent(table)};`);
  for (const line of lines.slice(1)) {
    const entry = JSON.parse(line) as { t?: string; r?: Record<string, unknown> };
    if (!entry.t || !entry.r) throw new Error("A line in the backup is not a row.");
    const cols = Object.keys(entry.r);
    out.push(`INSERT INTO ${quoteIdent(entry.t)} (${cols.map(quoteIdent).join(", ")}) VALUES (${cols.map((c) => sqlValue(entry.r![c])).join(", ")});`);
  }
  return out.join("\n") + "\n";
}
