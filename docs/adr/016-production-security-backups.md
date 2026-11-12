# ADR 016: Production, security, backups and monitoring (Phase 8)

Status: **built, on staging and on production** (12 Nov 2026). Production is live at https://forestfae.ca and https://api.forestfae.ca behind the "Coming soon" page. Nothing owner-facing has been sent. The handover steps themselves are in [handover.md](../handover.md), and everything the next developer needs is in the [runbook](../runbook.md).

Decided with the developer on 12 Nov: cut over **early** (so the real inventory can be imported and real labels printed against the real address), backups in a **separate R2 bucket** in the same account, **no third-party error service**, and the Owner Guide **inside the admin**.

## Production environment

| Thing | Production | Staging |
|---|---|---|
| Website | `https://forestfae.ca` (Worker `ffa-web`). `www.forestfae.ca` redirects to the bare domain (308) | `ffa-web-staging.forestfaefolk.workers.dev` |
| API | `https://api.forestfae.ca` (Worker `ffa-api`) | `ffa-api-staging.forestfaefolk.workers.dev` |
| Database | D1 `ffa-prod` (id in `apps/api/wrangler.jsonc`) | `ffa-staging` |
| Photos | R2 `ffa-prod-media` | `ffa-staging-media` |
| Backups | R2 `ffa-prod-backups` | `ffa-staging-backups` |
| `workers.dev` address | **Switched off** for both production Workers, so each has exactly one public address | On |
| Indexing | `VITE_INDEXABLE=true`, but search engines still see nothing until the owner publishes | Never |

- Both Workers sit on custom domains in the dedicated Cloudflare account. The DNS records for them were created by the deploy.
- Which environment the web app is built for is decided by `pnpm deploy:staging` and `pnpm deploy:production` in `apps/web` (`scripts/deploy.mjs`). It sets `FFA_ENV`, the API address and the site address for that build. Before this, a single `.env.production` file served staging, which would have been easy to get wrong.
- The API's `env.production` block in `wrangler.jsonc` has its own database, buckets, cron schedules and custom domain. `pnpm db:migrate:production` and `pnpm deploy:production` in `apps/api` do the rest.
- Production secrets were generated at random and uploaded directly (nobody has read them): `SESSION_SECRET` (API), `INTERNAL_SECRET` (the **same** value on both Workers). `RESEND_API_KEY` and `ALERT_EMAIL` are still to be set (see the handover list).
- The POS app's production build profile already pointed at `https://api.forestfae.ca`.

## Security headers (non-functional requirements, "Security")

- **Web** (`apps/web/lib/security-headers.ts`, applied by `next.config.ts` to built sites only): a Content-Security-Policy, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, a referrer policy, a permissions policy and `Cross-Origin-Opener-Policy`.
  - The CSP allows scripts and styles from the site itself plus inline ones (the framework streams an inline bootstrap script, and the styling uses style attributes), Cloudflare's analytics beacon and Turnstile. Images and connections may also go to the API's address, which is read from the build so it always matches. There is no `unsafe-eval`, no wildcard, no framing, no plugins, and forms can only post to the site itself.
  - Web Bluetooth stays available to the site (that is how the admin prints to the label printer). Camera, microphone, location, payment and USB are refused.
  - Checked on staging in a real browser: sign-in, the dashboard, settings, the public site and the style guide, with no CSP violations and no broken images.
- **API** (`apps/api/src/security.ts`): every response gets `nosniff`, `X-Frame-Options`, a `default-src 'none'` policy, a no-referrer policy and (outside local development) HSTS. A route that sets its own header keeps it, so the sample pictures keep their stricter sandbox policy.

## Error reference IDs ("Something went wrong" with a support reference)

- An unexpected failure in the API gets an 8-character reference (`K7M2QX4P`, no look-alike letters). The **same code** is written to the log (`event: "api-error"`, with the path and the real message) and shown to the person: in the red message after a failed action, and on the website's error page (the framework's own code there).
- **A leak was found and fixed while doing this.** tRPC puts the thrown error's own message in the response, so a database error would have been sent to the browser. The error formatter now replaces it with "Something went wrong on our side." for every unexpected failure. A test proves a raw database message never reaches the caller.
- Anything that escapes the route handlers is caught in one place, answered with `{"error", "reference"}` and logged.
- To find the cause of a reported code: Cloudflare dashboard, Workers, `ffa-api`, Logs, search for the reference.

## Backups (HAND-6, "Data protection")

Two layers, both in the dedicated Cloudflare account (which becomes the owner's at Stage 2):

1. **D1 Time Travel** (built in, 30 days, to the minute). The first thing to reach for after a bad change. Commands are in the runbook.
2. **Files in `ffa-prod-backups`:**
   - `db/YYYY-MM-DD.ndjson.gz`: every table's rows (one JSON object per line, parents before children), written every night at 07:17 UTC (about 2 am in Toronto). Thirty days are kept, and **at least the newest three are always kept**. The files include password hashes and customer details, so the bucket is private and stays out of any public access.
   - `media/<same key>`: a copy of every photo and generated file in the media bucket. Cloudflare's free plan allows 50 outside calls per run, so the 15-minute health check also copies up to 10 missing files each time and catches up quickly. Files later deleted from the media bucket **stay** in the backup on purpose.
   - Left out on purpose: the rate-limit table (it refills itself), the migration log (migrations come from the repository), and Cloudflare's internal tables.
- **Restore** (`pnpm --filter @ffa/api restore-backup <file>`) turns a backup into plain SQL: clear the few tables the migrations seeded, then insert every row. Applied to an empty, migrated database. **This was rehearsed on 12 Nov**: the staging backup was downloaded, restored into a throwaway remote database, row counts matched, and the database was deleted. A test also restores a backup into a fresh database and compares the rows, including awkward text. The database's own append-only rules refuse to clear a database that has real history, so restoring into the wrong one fails instead of doing damage.
- **"Export my data"** (Settings, administrator only): a zip of spreadsheets (pieces with cost, sales, customers, events, messages) with a plain-language README. It is for the owner's own records, **not** a restore source. Cells that start with `=`, `+`, `-` or `@` are neutralised so a title can't run as a spreadsheet formula.
- Settings also shows the last backup (time, how many copies, how many photos) and a "Back up now" button for before a big change. Both are written to the audit log.

## Monitoring (observability)

- A check runs **every 15 minutes** from the API Worker: the database, the photo storage, the website (`/healthz` on the web Worker) and the age of the last backup. A brand-new environment makes its first backup on the first run.
- **Alerts:** an email to `ALERT_EMAIL` (a Worker secret, so no personal address is in the repository) after **two bad checks in a row**, a reminder once a day while it stays broken, and an all-clear when it recovers. The state lives in the backup bucket. With no email provider or no address, it logs only.
- **Honest limits:** this can't notice if all of Cloudflare, or the API Worker itself, is down, because it runs there. Cloudflare's own Health Checks and Notifications need a paid plan. The runbook recommends a free outside monitor (UptimeRobot or similar) watching `https://forestfae.ca/healthz` and `https://api.forestfae.ca/health`, set up on the developer's email until handover.
- Workers Logs are on (`observability` in `wrangler.jsonc`), and the logs are structured JSON.
- Cloudflare's free plan allows 5 cron triggers per account. Staging and production use 2 each, so 4 of 5 are used.

## Dependency scanning

- `pnpm audit --audit-level high` runs in CI and fails the build on a high or critical advisory. Dependabot opens weekly update pull requests (npm) and monthly ones (GitHub Actions).
- The audit found one **high** advisory (a Vite development-server flaw, reached through vitest and vinext). It is fixed by pinning `vite` to 8.3.8 with a pnpm override and in the web app. The remaining ones (7 moderate or low) are all in development tooling that never ships to a Worker: the Expo command-line tool (`node-forge`, `glob`), drizzle-kit's old esbuild, ESLint's minimatch, and `fflate` inside vinext's image-generation helper, which the site doesn't call with untrusted input. They are reviewed with the weekly updates.

## Rate limiting and other existing protections (reviewed, unchanged)

Per-address limits already exist for sign-in (20 per 15 minutes, plus per-account lockout), set-password and reset links (10 per 15 minutes) and the contact form (5 per hour), kept in D1. Uploads are administrator or staff only and the file type is read from the bytes. A Cloudflare WAF rate-limiting rule for the whole site is optional and can be added in the dashboard (the free plan includes one rule).

The independent security review's findings are recorded in the section below.

## The Owner Guide (HAND-5)

Lives **inside the admin** as "Guide" (administrator), with a one-page **Quick start for staff** and a **Market day checklist** (everyone), all with print styles (menus hidden, plain paper). The words are data in `apps/web/lib/guide.ts`, written in the same plain style as the help drawer and checked by `tests/guide.test.ts`: it covers the topics the requirements list (products, photos, stock, events, labels, selling at a market, inquiries, what to do when something goes wrong), has no developer jargon and no mention of features the owner doesn't have, keeps the staff page to one sheet, and says plainly **who holds the domain and hosting now and when that changes** (HAND-8). Five real screenshots (1280×800, in `apps/web/public/guide`) illustrate it. The runbook says how to retake them. The new pages are covered by the "?" help drawer and are axe-clean at 1280 and 375 px.

## The independent security review

A read-only review of the API, the web app and this phase's new code (authentication and roles, public endpoints and data exposure, uploads and media, server actions and route handlers, the headers, backups, exports and the monitor, and secrets in the repository) **reported no findings**. It was a short pass (about four minutes), so it is **not** a substitute for the checks that did find things: the headers test, the response-leak test (which caught the error-message leak described above) and the CSV-injection test. Worth repeating with more time after launch.

One more thing found while testing, not security: **a Worker may only export handlers.** An exported constant from the API's entry file stopped `wrangler dev` from starting (production tolerated it). The schedule string now lives in `src/schedule.ts`.

## Alternatives considered

| Option | Why not |
|---|---|
| Sentry | Another account to hand over, another dependency, and a free tier that limits events. Reference IDs plus Workers Logs answer "what went wrong for this person" without it. Revisit if the logs prove too hard to search |
| Cloudflare Health Checks and Notifications | Need a paid plan |
| Backups to the owner's Google Drive | Needs the owner's Google account and an app registration before handover. Could be added later as a monthly copy |
| Cut over late | The real inventory can't be imported and labelled against the real address until production exists (HAND-0) |
| One shared `.env.production` for every environment | Easy to deploy staging pointing at production or the reverse. Replaced by the deploy script |
| `content-security-policy` with nonces | The framework's streamed bootstrap script makes nonces hard on this runtime. Revisit if vinext adds support |

## Risks and open items

- **Backups cost nothing now but grow with the photos.** R2's free tier is 10 GB and the 15-minute run copies up to 10 files at a time. If Workers Paid is bought, raise the budget.
- **The first alert email can't be tested until `RESEND_API_KEY` and `ALERT_EMAIL` are set on production.** The logic is covered by tests.
- **Cron times are in UTC.** The nightly run lands at 2 am (winter) or 3 am (summer) in Toronto.
- A restore drill should be repeated on production before handover day, with real data.
- Lighthouse and CLS on `https://forestfae.ca` are still to measure (the site is hidden from visitors, so run it while signed in or briefly published).
- The outside uptime monitor, the production `RESEND_API_KEY` and `ALERT_EMAIL`, the first administrator and the real inventory are developer tasks, listed in [handover.md](../handover.md).
