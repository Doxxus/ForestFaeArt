# Phase 0 Kickoff: Forest Fae Folk Art

Status: **draft for developer approval**. No application code has been written. Date: 31 Oct 2026 (Phase 0 target window: 27 Oct to 3 Nov).

## a. Understanding

One Cloudflare-hosted platform (single D1 database, single tRPC API, first-party sessions) backs a whimsical portfolio site, an owner-friendly admin, a label/QR system for one-of-a-kind insect artworks, and an Android-only POS that records sales and tolerates poor connectivity. E-commerce, Square and Etsy sync are designed for (nullable fields, provider interfaces) but not built. It is a secret Christmas gift: the developer owns every account, nothing goes to the owner before the handover session, and all P0/P1 scope must be handed over by 25 Dec 2026.

## b. Assumptions

1. The developer is solo, so the phase overlaps below are real parallel work.
2. `forestfae.ca` is currently registered at **Cloudflare Registrar** (see risk R1 if the account is the owner's).
3. The Android 10+ test phone and the NIIMBOT B1 are in hand now.
4. Money is integer CAD cents, timestamps are UTC, IDs are ULIDs, SKU is `FFA-` + zero-padded counter (`FFA-000123`). The SKU counter lives in a table updated atomically so SKUs are never repeated or reused.
5. D1 has no interactive transactions. Every multi-write business operation (sale + stock decrement + `InventoryTransaction` + `Payment`) uses a single `db.batch()` with a guarded `UPDATE ... WHERE quantity >= n`, and POS retries use client-generated idempotency keys with a unique index.
6. The public API is a separate projection (`public.*` procedures with allow-listed columns), never the admin DTO with fields filtered afterwards.
7. STAFF cost-hiding is done by role-specific output schemas on the server, not by omitting UI.

## c. Phase 0 spike plan (requirements 16.2) and findings so far

Official-docs checks were done today. Items marked **hands-on** need the developer or hardware.

| # | Spike | Finding / plan | Outcome so far |
|---|---|---|---|
| 1 | Domain move | Cloudflare supports account-to-account moves for Registrar domains. Needs: domain older than 10 days, registrant email verified, DNSSEC off, no pending Change of Registrant, domain **added as a site in the new account with a plan selected**, move started from the **source** account (Manage Domain > Configuration > Start), approved in the **gaining** account within **5 days**. WHOIS moves as-is, **no DNS or other config moves**, the registration is **transfer-locked 30 days**, and the gaining account takes over renewals. Source: [Cloudflare docs](https://developers.cloudflare.com/registrar/account-options/inter-account-transfer/) (updated Apr 2026) | Feasible. Not yet executed. **hands-on** |
| 2 | Stage 2 ownership handover | The domain and everything else will already be in the dedicated account, so Stage 2 is adding the owner as Super Administrator, moving billing, and reviewing registrant details (`.ca` Canadian-presence rule). The 30-day lock does not matter since no registrar move is needed later. Rehearse in Phase 8 with a throwaway second email | Plan confirmed on paper. Verify the role flow in Phase 8 |
| 3 | QR with centre logo on B1 at 40x30 mm | ECC H with logo at about 12% area, 1-bit render, decode every rendered label in a `label-engine` test (e.g. `zxing-wasm` or `jsQR`), then print on the real B1 and scan with 2 phones at several angles. Fallback: smaller logo area, or a plain QR | **Done, passed on the real B1 (31 Oct 2026)**: lower-case URL with and without the logo, and upper-case URL with no logo and with a 14% logo, all scan. See [label-print-test.md](./label-print-test.md) and [ADR 004](./adr/004-label-rendering.md) |
| 4 | NIIMBOT B1 Bluetooth (Android) | The protocol is unofficial. Spike a small Expo dev build with a BLE module (e.g. `react-native-ble-plx`) or a community protocol library, printing a 1-bit bitmap. Approved fallback: PNG/PDF export through the NIIMBOT app (ADR) | **Deferred (3 Nov 2026) to the start of Phase 5 (now about 5 Nov, see the release plan)**, timebox 1 day. **Update 4 Nov: route changed from an Expo build to Web Bluetooth in Chrome on Android (`@mmote/niimbluelib`, MIT), which needs no native build. PASSED on the real B1 on 4 Nov: it prints directly from Chrome on Android, and the printed label scanned to the right product page. See [ADR 013](./adr/013-label-printing.md#spike-4-b1-over-bluetooth).** Direct Bluetooth is P1 (LBL-9) and PNG export already works on the B1. How the POS app (Phase 6) prints labels is decided at the start of Phase 6 |
| 5 | Email | Cloudflare Email Service sending is **Workers Paid only**: 3,000 included per month, then $0.35 per 1,000; sends to verified destination addresses are free. Email Routing (inbound) is free and unlimited ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/), updated Jun 2026). Resend free tier **verified from the Resend dashboard on 31 Oct 2026**: 3,000 emails/month, 100/day, 3 domains, 3 inboxes, 30-day log retention, no SSO. That is ample for receipts and inquiry replies for a two-person business, so Resend stays the default behind the `EmailProvider` interface and Cloudflare Email Service is the alternative. Still to do: SPF (one merged record), DKIM and DMARC alongside Email Routing, once the zone is built out | Answered. Free tier limits confirmed, ADR still to write |
| 6 | Next.js on Workers | **Workers Free CPU limit is 10 ms per request; Paid is 30 s default (up to 5 min).** SSR with auth typically uses 10-20 ms ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), updated 29 Oct 2026). **Conclusion: plan on Workers Paid (about USD 5/month)**, which the owner already accepts. Worker size limit is 64 MiB on both plans, so bundle size is not a blocker. **New finding:** Cloudflare's current Next.js guide recommends **vinext** (a Vite reimplementation of the Next.js API, labelled *beta*) as the default for Next.js on Workers, with OpenNext as "another path". The build prompt names OpenNext | See decision D1 (resolved: vinext first, see ADR 002). Verified live on Workers Free: tRPC, Drizzle and D1 (deploy to the dedicated account, ADR 002), and scrypt password hashing (ADR 003). Still to do: the first-party auth layer and the Workers Paid CPU check under real load |

Each spike ends with a one-page ADR (decision, evidence, fallback). Anything infeasible is flagged before dependent building starts.

## d. Release plan

Today is 31 Oct, so Phase 0 has about 3 days left. Proposed adjustments to the indicative dates (last re-planned **4 Nov**, when Phase 9 was added):

| Phase | Plan | Change |
|---|---|---|
| 0 | Gate by **3 Nov**: architecture approved, monorepo + CI scaffold, staging Worker deployed, D1/R2 bound, auth layer scaffolded, ADRs. Hands-on spikes (domain move, B1, QR print test) run in parallel and may finish by **7 Nov** without blocking Phase 1 | Spikes may spill over 4 days. **Status 31 Oct:** monorepo, CI, staging API (with D1 and auth) and staging web are done, see [staging.md](./staging.md). Logo direction approved (see [ADR 005](./adr/005-brand-direction.md)). **Status 3 Nov:** domain move started and waiting on nameserver propagation. The B1 Bluetooth spike is deferred to the start of Phase 5. Still open for Phase 0: email ADR (needs the zone), Workers Paid CPU check. **Phase 1 (3 Nov): data model, inventory service, auth endpoints, audit log and API skeleton built and tested, see [ADR 006](./adr/006-data-model.md)**. **Phase 2 API (3 Nov): product editing, categories, metadata, photos, inventory list and dashboard counts, and CSV import are built, tested and deployed to staging ([ADR 007](./adr/007-photos.md), [ADR 008](./adr/008-csv-import.md)). The admin web app (sign in, dashboard, products and photos, categories, fields, users, settings, import) is built and deployed to staging, see [ADR 009](./adr/009-admin-web-app.md)**. **Phase 3 (3 Nov): events (with pieces taken to events, wrap-up and calendar files), editable website content, the inquiries inbox with replies, and the publish checklist are built and tested, see [ADR 010](./adr/010-events-content-inquiries.md). Email sending is live on staging (verified 3 Nov). Turnstile is deliberately off, with switch-on steps in [staging.md](./staging.md#turnstile-not-switched-on-yet)**. **Phase 4 (3 Nov, pulled forward): the public website (home, portfolio with search, sort and filters, product pages, events, About, Contact, legal pages), the "Coming soon" switch and `/p/<sku>` QR route, SEO, the full SVG art kit, the favicon and link-preview picture, and the style guide are built, tested and deployed to staging, see [ADR 011](./adr/011-public-site.md). Still to do for the site: Lighthouse scores on the real domain (Phase 8), edge caching and security headers (Phase 8), analytics and Turnstile keys when wanted. **Re-plan (4 Nov): the public site's look is being redone in the new Phase 9 (8 to 14 Dec) with a greener, more whimsical design, see [ADR 012](./adr/012-public-site-redesign.md). Phases 5 to 7 were re-dated to make room, and Phase 5 starts now**
| 1 | 3 to 10 Nov | **Done 3 Nov** (pulled forward with Phases 2 to 4) |
| 2 | 10 to 20 Nov | **Done 3 Nov**, except importing the real inventory (the owner's spreadsheet is not ready yet) |
| 3 | 20 Nov to 1 Dec | **Done 3 Nov**, pulled forward (see [ADR 010](./adr/010-events-content-inquiries.md)) |
| 4 | **3 to 17 Nov** (was 24 Nov to 10 Dec) | **Done 3 Nov.** Pulled forward (decided 3 Nov: public site before labels), see [ADR 011](./adr/011-public-site.md). Its look is being redone in Phase 9 |
| 5 | **4 to 14 Nov** (was 17 to 27 Nov) | **Re-dated 4 Nov**: Phases 1 to 4 finished three weeks early, so labels start now. Follows Phase 4 so the QR labels point at a real page. **Status 4 Nov: built, tested and deployed to staging, see [ADR 013](./adr/013-label-printing.md)**: label designs (presets, editor, live preview, scan warnings), printing by piece, category, event, unlabelled or out-of-date, PNG, PDF and A4 sheets (margins, gaps, crop marks, start position, copies), print records, the out-of-date label flag, TEST stamping, and direct B1 printing over Web Bluetooth. **Still open: a 50 x 30 label and a multi-label batch with copies are not yet tried on the B1.** The B1 Bluetooth spike **passed on 4 Nov** (see row 4 of the spike table). The QR print test is already done |
| 6 | **14 to 30 Nov** (was 27 Nov to 8 Dec) | **Re-dated 4 Nov**, with a few days more room than before. Start the Expo dev build and offline queue skeleton early to de-risk. The B1 decision must be made first (Phase 5) |
| 7 | **30 Nov to 7 Dec** (was 8 to 14 Dec) | **Re-dated 4 Nov** to make room for Phase 9. Its accessibility and performance pass covers the admin and the sale flow. The redesigned public site is checked in Phase 9 |
| 9 | **8 to 14 Dec** (new) | **Added 4 Nov.** Public site redesign, see [ADR 012](./adr/012-public-site-redesign.md). Must be live-ready for the handover. **Feature freeze 14 Dec** moves here |
| 8 | 14 to 24 Dec | None. Hardening is the buffer for anything Phase 9 leaves rough, but it should not be spent on new visuals |

Mid-November scope checkpoint: 15 Nov. Descope in the order given in the requirements (decision 28) if Phase 2 is not done by then. Phase 2 is done, so the checkpoint now covers Phases 5 and 6 and whether Phase 9 stays whole (see R9).

### Biggest schedule risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | **The domain move is started in the source account and approved in the new one.** If the domain sits in the owner's Cloudflare account, someone must act there without alerting the owner. No DNS moves, so **existing DNS records (anything keeping `forestfaefolkart@gmail.com` mail or other services working) must be exported first** | Confirm where the domain is registered and who has access. Export the zone file before the move |
| R2 | Solo developer, 8 weeks of overlapping phases, large bespoke SVG kit | The SVG kit is done (19 assets). Descope order applies |
| R3 | B1 Bluetooth protocol is unofficial | PNG/PDF fallback is pre-approved. Timebox the spike. At the start of Phase 5 (about 5 Nov) |
| R4 | vinext is beta, OpenNext is mature but no longer Cloudflare's recommended path | Decision D1. Timebox the compatibility spike to 0.5 day each |
| R5 | A hand-written login layer is security-sensitive: token signing, cookie flags, CSRF, reset links, lockout and session handling can fail silently. It must serve three clients (Next.js cookies, the API Worker, the Expo POS app) | Small surface built on vetted primitives (`jose`, scrypt, WebCrypto), unit tests for every login rule in `packages/auth`, a login interface so it can be swapped, and a security review in Phase 8 (ADR 003) |
| R8 | No MFA at launch, so account takeover relies on password strength alone | Compensating controls in AUTH-8 (rate limiting, lockout, password policy, audit log). MFA (AUTH-9) is a post-launch follow-up |
| R6 | Offline POS and idempotency are easy to get subtly wrong | Unit-test the retry and duplicate paths before UI work |
| R7 | Short mid-December hardening window | Definition of Done enforced from Phase 1 (CI runs lint, typecheck, tests, build on every push) |
| R9 | The Phase 9 redesign is the last feature work before the 14 Dec freeze, it needs hand-drawn art, and a heavy animated background can hurt mobile speed and battery | Phase 9 touches presentation only, so it cannot break the features. It is built in value order (palette and backgrounds, then the parallax scene, then mushrooms, leaves and insects) so it can stop at any point and still look finished. A written mobile budget (ADR 012) and a Lighthouse mobile check are the exit gate. If Phases 5 to 7 slip past 7 Dec, descope the extras first, and keep the old look as the fallback because the redesign is switched on by the stylesheet and components, not by data |

## e. Proposed architecture and data model

### Monorepo (pnpm + Turborepo)

```text
apps/web        Next.js (App Router) on Workers: public site + admin (route group /admin)
apps/api        Cloudflare Worker: tRPC (fetch adapter), Drizzle on D1, R2, auth verification, rate limiting
apps/pos        Expo (Android dev/prod builds, EAS internal distribution)
packages/db           Drizzle schema, migrations, idempotent seed
packages/validators   Zod schemas shared by web, pos, api
packages/api-types    AppRouter type export only
packages/ui           Tailwind tokens, components, SVG kit (React)
packages/label-engine QR + label layout, PNG/PDF/A4 render, decode-verification tests
packages/config       tsconfig, eslint
docs/adr, docs/architecture, docs/runbook
```

### Key decisions (tradeoffs for approval)

1. **API as its own Worker** (not tRPC inside Next). Pros: web, POS and future clients share one deployment with a stable URL, independent rate limits, no Next on the POS hot path. Cons: one extra Worker and CORS config. Web calls the API through a Cloudflare **service binding** server-side and over HTTPS from the browser.
2. **Auth:** first-party sessions (email and password, no MFA at launch, see [ADR 003](./adr/003-auth.md)). The API verifies the session token itself and reads `role`, `active` and `sessionVersion` from the D1 `User` row on every request (**not** trusted from the token), so RBAC and session revocation never depend on the client. Procedures are built from `publicProcedure`, `staffProcedure`, `adminProcedure`.
3. **Images:** upload to R2 through a Worker-proxied or short-lived presigned upload, magic-byte sniffing, size limit, responsive variants generated at upload or via Cloudflare image transforms. Originals are retained for backup.
4. **Atomicity:** the guarded-UPDATE + `db.batch()` pattern is wrapped in one `inventoryService` that is the *only* writer of `quantity` and `status` and always writes an `InventoryTransaction`. Status transitions are a pure, unit-tested table.
5. **Interfaces:** `PaymentProvider`, `EmailProvider`, `PrinterAdapter`, `ShippingProvider` (type only), with `Payment.provider` and `providerRef` present. No Square UI or copy.
6. **QR URL** is built from the `qrBaseUrl` setting. Labels made against a non-production base URL get the "TEST" stamp.
7. **Placeholders, sample data, Coming soon** are runtime/DB flags (`isSample`, `siteLive`).

### Data model

The reference model in requirements section 15 is accepted with these amendments to confirm:

- `Product.priceCents` and `costCents` are integers. `quantity` has a check constraint `>= 0`. `status` becomes `SOLD` when quantity reaches 0, set only by the inventory service.
- Add `SkuCounter(key, nextValue)` for `FFA-` generation.
- Unique indexes: `product(sku)`, `product(slug)`, `product(externalId)` (import idempotency), `sale(idempotencyKey)`.
- `InventoryTransaction` is append-only (no update/delete procedures, plus SQLite triggers blocking UPDATE and DELETE).
- `AuditLog.diff` stores JSON text of changed fields and never secrets. Cost is visible to ADMIN only.
- `User.active`. No passwords or tokens stored.
- `SiteSettings` keys are a typed, Zod-validated set rather than free-form.
- Etsy fields (`listedOnEtsy`, `etsyUrl`, nullable `etsyListingId`) and `Sale.channel` includes `ETSY`.
- QR targets use the SKU, so slugs can change safely. Old slugs redirect.

Irreversible items **needing explicit approval**: ULID IDs, SKU format `FFA-000123` (six digits), integer-cents money, D1 as the only datastore, first-party sessions as the auth approach (no MFA at launch), `apps/api` as a separate Worker, and the Next.js-on-Workers route (D1).

## Next steps once approved

1. Install pnpm (`corepack enable`), scaffold the monorepo and CI (lint, typecheck, test, build), pin Node 24.
2. Create the dedicated Cloudflare account, start the domain move (R1), create staging D1/R2.
3. Throwaway spike app for spike 6, then ADRs.
4. ~~Three logo directions (SVG sketches) for developer approval.~~ Done and approved, see [ADR 005](./adr/005-brand-direction.md).
