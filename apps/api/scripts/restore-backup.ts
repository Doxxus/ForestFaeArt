/**
 * Turns a database backup into SQL that puts every row back (ADR 016, runbook "Restore from a backup").
 *
 *   pnpm --filter @ffa/api restore-backup <backup.ndjson.gz> [output.sql]
 *
 * 1. Download the file from the backup bucket (the runbook shows how).
 * 2. Make an EMPTY database and apply the migrations to it (`wrangler d1 migrations apply`).
 * 3. Run this to make the SQL, then apply it: `wrangler d1 execute <database> --remote --file <output.sql>`.
 *
 * It never touches a database itself. The database's own rules refuse to clear one that holds real sales history,
 * so applying the SQL to the wrong database fails rather than doing harm.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { backupToSql } from "../src/services/backup";

const [input, output = "restore.sql"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: pnpm --filter @ffa/api restore-backup <backup.ndjson.gz> [output.sql]");
  process.exit(1);
}

const raw = readFileSync(input);
const text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
const sql = backupToSql(text);
writeFileSync(output, sql);
const meta = JSON.parse(text.split("\n")[0]!) as { createdAt: string; counts: Record<string, number> };
const rows = Object.values(meta.counts).reduce((a, b) => a + b, 0);
console.log(`Backup from ${meta.createdAt}: ${rows} rows in ${Object.keys(meta.counts).length} tables.`);
console.log(`Wrote ${output}. Apply it to an empty, migrated database with: wrangler d1 execute <database> --remote --file ${output}`);
