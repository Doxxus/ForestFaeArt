# ADR 006: Data model, inventory rules and API skeleton

Status: **proposed** (3 Nov 2026, Phase 1). Built and tested, staging migrated. The developer should review the "Decisions to confirm" list before Phase 2 builds the admin on top. The staging database is empty and production does not exist yet, so a schema change before cut-over is cheap. After the first real data is imported it becomes a migration.

## Context

Phase 1 needs the full data model (requirements section 15), RBAC with cost hidden from STAFF, an audit log and an API skeleton. D1 has no interactive transactions, so concurrency rules (never oversell, never sell the same piece twice) have to live in single statements and `db.batch()`.

## Decision

**Schema** (`packages/db/src/schema.ts`, migrations `0001` to `0003`): 26 tables. The reference model in the requirements is kept, with these additions.

| Addition | Why |
|---|---|
| `setting` (key, JSON value) with the key set defined in `@ffa/validators` | Typed, validated settings instead of free-form keys. Defaults live in code, so a missing row is never an error |
| `slug_redirect` | A title change renames the slug, but shared links keep working. QR codes use the SKU, so printed labels never depend on it |
| `content_block.is_draft` | Placeholder copy stays flagged "draft" until the owner publishes |
| `rate_limit` | Per-IP sign-in limits (AUTH-8) in D1, so no extra service or plan is needed |
| `sale.occurred_at` and `sale.idempotency_key` | The POS may sync a sale later. A retry never double-sells |
| `event_product.previous_status` | "Wrap up event" returns unsold pieces to their old status (EVT-6) |
| `product.reserved_*` | Reserved-for customer, note and expiry (INV-9) |
| `label_print.qr_url` and `is_test` | Stale-label detection and the TEST stamp (LBL-6, LBL-13) |
| `customer.anonymized_at` | Delete-on-request keeps sale history (CUS-5) |

**Rules the database enforces itself**, so a bug in the app cannot break them (all covered by `apps/api/test/schema.test.ts`):

- `quantity >= 0`, prices and cost `>= 0`, status and enum columns limited to known values.
- `SOLD` if and only if `quantity = 0` (for the stocked statuses). A product with stock cannot be `SOLD`, and an offered product cannot have no stock.
- At most one primary image per product, and one default label template.
- Unique SKU, slug, import `external_id`, sale `idempotency_key` and sale number.
- `inventory_transaction` and `audit_log` refuse UPDATE and DELETE (triggers). Products cannot be hard-deleted (PROD-3).

**Inventory service** (`apps/api/src/services/inventory.ts`) is the only writer of `product.quantity` and `product.status`:

- Every change is a guarded `UPDATE` plus a ledger `INSERT` in one `db.batch()`. The ledger row's NOT NULL columns are computed with `changes()`, which is 0 when the guard did not match. The insert then fails and the whole batch rolls back, which is how a sale with several lines becomes all-or-nothing.
- Sales use a relative decrement (`quantity = quantity - n WHERE quantity >= n`), so two buyers of a multi-quantity item both succeed and the last unit is never sold twice. Tested with concurrent sales.
- Status moves come from a pure table in `@ffa/validators` (`STATUS_TRANSITIONS`): reopening a `SOLD` item needs ADMIN and a reason, archiving and restoring are ADMIN only.
- `SOLD` always means no stock left. Making a sold or archived item available again puts stock back (default 1).

**Visibility and privacy**

- STAFF responses are built without `costCents` at the API (`projectProduct`). The public product is an explicit whitelist (`toPublicProduct`), so a new column is private by default. Pending payments are shown to the public as available.
- The public catalog returns nothing until `siteLive` is on (WEB-18). Signed-in staff can preview.
- Public settings are a whitelist too. Business emails, the QR base URL and tax settings are never public.
- `audit_log.diff` drops any key that looks like a secret. Failed sign-ins are audited with the internal reason, and the client always gets the same message.
- tRPC is created with `isDev: false`. Without it, every error response includes a stack trace, because Workers do not set `NODE_ENV`. Found on staging and fixed, with a regression test.

**Auth endpoints** (`apps/api/src/routers`): `auth.login` (per-IP rate limit and audit), `auth.tokenStatus`, `auth.setPassword`, and ADMIN-only `users.list/invite/update/issueLink/revokeSessions`.

- Links are returned to the administrator to pass on. Nothing is emailed before the handover session. The web app serves them at `/set-password?token=...` (Phase 2).
- Invite links last 7 days, reset links 1 hour. Only the newest link for a user works, links work once, and setting a password signs the user out everywhere.
- The last active ADMIN cannot be demoted or switched off. The guard is part of the UPDATE statement, so two administrators cannot demote each other at the same moment.

**Testing.** API tests run against a real local D1 (workerd, via wrangler's `getPlatformProxy` with `persist: false`, so nothing is stored on disk), with every migration applied. Miniflare 5 (beta) was tried first and its options changed incompatibly, so it is not used directly.

## Decisions to confirm

1. **Timezone default `America/Toronto`** for events. It is editable per event. Change it if the owner is not in Eastern time.
2. **STAFF can create products and change most statuses**, but cannot set cost, archive, restore or reopen a sold piece. The requirements are silent on STAFF creating products.
3. **`PENDING_PAYMENT` is not sellable** (INV-10), and `RESERVED` is (to the customer it is held for).
4. **Metadata values are text rows** (EAV), not a JSON column. It filters and sorts with plain SQL. Cost: one row per value.
5. **Description is plain text** in the database. "Limited formatting" will be a small Markdown subset rendered safely, decided in Phase 2.

## Not built yet (by design)

Product editing, categories and metadata endpoints, images, import, events, inquiries, sales, labels, customers (Phases 2, 3, 5 and 6). The tables and rules for all of them exist now.

## Consequences

- Any code that changes stock outside `inventory.ts` is a bug. Reviews should look for writes to `product.quantity` or `product.status`.
- Later phases add endpoints and services but should not need schema changes. If one does, it is an additive migration.
