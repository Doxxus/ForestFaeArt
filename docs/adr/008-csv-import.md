# ADR 008: CSV inventory import

Status: **accepted** (3 Nov 2026, Phase 2). Implements requirements section 4.1 and Appendix A.

## Decision

- **A pure parser, then a thin service.** `@ffa/validators` (`import-csv.ts`) reads and checks the file with no database access: RFC 4180 CSV (BOM, quotes, line breaks inside cells, CRLF), header matching that ignores case, spaces, underscores and hyphens, and per-row errors and warnings with the real line number. `apps/api/src/services/import.ts` loads the current categories and metadata fields, calls the parser, and writes.
- **Three steps, all ADMIN only:** `import.preview` (dry run, writes nothing), `import.run` (imports for real) and `import.undo`. The server re-parses the file on `run`, so the preview can never be out of date. (`apply` is a reserved name in tRPC, hence `run`.)
- **Bad rows never block good rows.** Rows with errors are skipped and returned as a "fix these" CSV: the original columns plus an `error` column. Warnings (for example "sold but quantity above 0") do not block.
- **Missing categories and choices need the owner's say-so (IMP-4).** The preview lists them. `run` rejects the rows that need them unless `createMissing` is true, in which case it creates the categories and appends the choices first. Select fields with no choices yet (Tags, Collection) therefore always ask once.
- **Idempotent by `external_id` (IMP-6).** Rows whose `external_id` already exists are skipped by default or updated (`existing: "update"`). An update changes details, categories and metadata, and **never stock or status**, so the ledger stays the single source of truth for those. Rows with no `external_id` get a warning if a product with the same title and price already exists.
- **Imported products** get a generated SKU (a block is reserved from the counter in one query), a unique slug, an `IMPORT` ledger entry carrying the batch id, `portfolioVisible = false` unless the row says yes, and no photos, so they land in the "Needs photos" queue. "Sold" and "no stock" are kept in step (a sold row is imported with quantity 0, and quantity 0 imports as sold), each with a warning.
- **Undo archives, it never deletes.** `import.undo` archives every product the batch created that is not already archived, writes an "Import undone" ledger entry for each, and marks the batch undone. It works once per batch.
- **Sized for D1 and Workers.** Products are written 25 at a time in one `db.batch()` (about 150 statements), so 1,000 rows is about 40 D1 calls, within the Workers subrequest limit. A batch is atomic. If a later chunk fails, the earlier chunks stay and the whole import can be undone. Limits are 1,000 rows and 5 MB. A 260-row import runs in about a second against local D1.
- **The template** is `IMPORT_TEMPLATE_CSV` in `@ffa/validators` (also served by `import.template`), and a test parses it so it cannot drift from the importer. The root `inventory_import_template.csv` is a copy for convenience.

## Consequences

- Dry-run results, fix-it CSV and batch history are ready for the Settings > Import screen. That screen is not built yet.
- Real-inventory import happens after the spreadsheet is reshaped to Appendix A (HAND-7), and after the owner's categories and choices are confirmed.
