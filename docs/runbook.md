# Runbook

For the developer, and for any competent developer who takes over (HAND-6). Plain steps, in the order you will need them. Decisions and reasons are in the [ADRs](./adr/); the day-to-day staging notes are in [staging.md](./staging.md); the plan for handover day is [handover.md](./handover.md).

Contents: [Where everything is](#where-everything-is) · [Accounts](#account-inventory-hand-1) · [Costs](#costs) · [Deploy and roll back](#deploy-and-roll-back) · [Secrets](#secrets-and-rotation-hand-3) · [Backups and restore](#backups-and-restore) · [Monitoring](#monitoring-and-alerts) · [Common tasks](#common-tasks) · [When something is wrong](#when-something-is-wrong) · [If the developer is unavailable](#if-the-developer-is-unavailable-hand-8) · [Stage 2](#stage-2-passing-the-cloudflare-account-to-the-owner-hand-2)

## Where everything is

| | Production | Staging |
|---|---|---|
| Website and admin | https://forestfae.ca (`www` redirects here). Worker `ffa-web` | https://ffa-web-staging.forestfaefolk.workers.dev. Worker `ffa-web-staging` |
| API | https://api.forestfae.ca. Worker `ffa-api` | https://ffa-api-staging.forestfaefolk.workers.dev. Worker `ffa-api-staging` |
| Database (D1) | `ffa-prod` | `ffa-staging` |
| Photos (R2) | `ffa-prod-media` | `ffa-staging-media` |
| Backups (R2) | `ffa-prod-backups` | `ffa-staging-backups` |
| Health | `GET https://api.forestfae.ca/health` and `GET https://forestfae.ca/healthz` | the same on the staging addresses |
| Logs | Cloudflare dashboard, Workers & Pages, the Worker, Logs (structured JSON, searchable by `reference`) | same |

- Code: GitHub `Doxxus/ForestFaeArt`. CI (`.github/workflows/ci.yml`) runs audit, lint, typecheck, test and build on every push and pull request.
- Layout: `apps/api` (Worker), `apps/web` (website and admin), `apps/pos` (Android app), `packages/*` (shared). See the [README](../README.md).
- The `workers.dev` addresses of the two **production** Workers are switched off on purpose. Production has exactly one address each.
- The monorepo needs Node 24 and pnpm 12. Two CLI logins are used: `npx wrangler login` (API, D1, R2, secrets) and `npx cf auth login` (the web deploy).

## Account inventory (HAND-1)

Recovery codes, passwords and security keys are **not** in this repository. They are in the developer's password manager. At Stage 1 the owner is added to the accounts that allow it, and the table is updated.

| Account or service | What it is for | Held by now | Billing | Notes |
|---|---|---|---|---|
| **Cloudflare** (dedicated, project-only account) | Registrar and DNS for `forestfae.ca`, both Workers, D1, R2 (media and backups), Email Routing, Images, Web Analytics (optional), Turnstile (optional) | Developer, on a project email address that can be handed over | Developer's card until Stage 2, then the owner's | Everything lives here so that Stage 2 is one handover, not a migration. See [Stage 2](#stage-2-passing-the-cloudflare-account-to-the-owner-hand-2) |
| **Domain registrar** | `forestfae.ca` registration (three years prepaid) | Cloudflare Registrar, in the account above | Prepaid | Registrar lock on, auto-renew on (check in the dashboard). A `.ca` domain needs a Canadian-presence registrant: review the registrant at Stage 2 |
| **Resend** | Sending email (inquiry notices and replies, receipts, alerts) from `forestfae.ca` | Developer | Free tier (3,000 a month, 100 a day) | The owner creates their own Resend account at handover, the domain is re-verified there and the key replaced (HAND-2, HAND-3) |
| **GitHub** | Source code, CI, Dependabot | Developer | Free | Add the owner as a collaborator, or transfer the repository, at the developer's discretion |
| **Expo / EAS** | Building the Android POS app | Developer | Free tier | Builds are `preview` (staging) and `production`. The **Android signing key** is held by EAS: download and store it before handover (HAND-3). See [handover.md](./handover.md) |
| **Gmail** `forestfaefolkart@gmail.com` | Where `asa@forestfae.ca` forwards (Cloudflare Email Routing) | The owner | n/a | Destination verification is a handover-day step (HAND-0 says nothing is sent to the owner earlier) |
| Sentry, Google Play, Square, Stripe, Etsy API | **Not used.** Listed so nobody wonders | n/a | n/a | Etsy is only a link and a reminder in the POS app |

## Costs

| Item | Now | After handover |
|---|---|---|
| Cloudflare Workers | Free plan | **Workers Paid, about US$5 a month, if it is needed** (more CPU time and 1,000 outside calls per request instead of 50). Upgrade in the dashboard, Workers & Pages, Plans. The site works on Free today. Backups and the photo catch-up are written to fit the free limits |
| D1, R2, Images | Free allowances are ample for a small shop (R2: 10 GB, D1: 5 GB) | Same. Watch R2 if photos pile up: media and its backup copy both count |
| Domain | Prepaid for three years | A `.ca` renewal is about CA$15 to $25 a year, due late 2029. The Cloudflare account's owner pays |
| Resend | Free | Free unless the shop sends more than 100 emails a day |
| Everything else | Free | Free |

Who pays what after handover is settled between the developer and the owner after handover (requirements, decision 32). Until Stage 2 the developer pays.

## Deploy and roll back

**Order for a change that touches the database:** migrate, then deploy the API, then deploy the web app. Old code must keep working against the new schema for a moment, so add columns before using them and remove them last.

```powershell
# from apps/api
pnpm db:migrate:staging         # or db:migrate:production
pnpm deploy:staging             # or deploy:production
# from apps/web
pnpm deploy:staging             # or deploy:production
```

- `pnpm deploy:production` in `apps/web` runs `scripts/deploy.mjs`, which sets the production API and site addresses for that build. Never deploy by calling the underlying command directly.
- **Before every production migration, back up first:** Settings, "Back up now" (or wait for the night run). Look at the SQL of the migration.
- After a deploy: open `/health` and `/healthz`, sign in, and load the public home page.
- Every deploy is also a Cloudflare "version". If a deploy goes wrong, **roll back the code** in seconds: `npx wrangler rollback --env production` (API, from `apps/api`; choose the previous version), or in the dashboard, the Worker, Deployments, "Rollback". A rolled-back API does **not** undo a migration, which is why migrations are written to stay compatible with the previous code.
- **Roll back the data** with D1 Time Travel (next section).
- Staging is safe to break. It holds no real data.

## Secrets and rotation (HAND-3)

All secrets live in Worker secrets. None is in the repository (`wrangler.jsonc` holds only ids and non-secret settings, and the audit log never stores secret-looking fields).

| Secret | Where | What it does | Rotate |
|---|---|---|---|
| `SESSION_SECRET` | `ffa-api` | Signs every sign-in token | `wrangler secret put SESSION_SECRET --env production`. **Signs everyone out**, including phones running the POS app (they sign in again; queued sales are kept). Use 48 random bytes |
| `INTERNAL_SECRET` | **Both** `ffa-api` and `ffa-web` (the same value) | Lets the website tell the API a visitor's address, for rate limiting | Put the new value on the API (`--env production`) and on the web Worker (`--name ffa-web`). Until both match, rate limiting counts the web Worker's address, not visitors' (harmless, briefly) |
| `RESEND_API_KEY` | `ffa-api` | Sends email. Use a sending-only key restricted to `forestfae.ca` | Create a new key in Resend, `wrangler secret put RESEND_API_KEY --env production`, then delete the old key in Resend. Without it email waits and is retried |
| `ALERT_EMAIL` | `ffa-api` | Where problem alerts go | `wrangler secret put ALERT_EMAIL --env production` |
| `TURNSTILE_SECRET` | `ffa-api` (optional, not set) | Contact-form challenge. See [staging.md](./staging.md#turnstile-not-switched-on-yet) | n/a |
| Cloudflare login | Developer | Everything | At Stage 1 the owner is added as a member. At Stage 2 the developer is removed or kept as support |
| EAS / Android signing key | Expo | Lets app updates install over the old app | Download the keystore (`eas credentials`) and keep a copy with the owner's recovery information |
| First administrator | The `user` table | Sign-in | At handover the developer's account is switched off or downgraded (AUTH-6), see below |

**Generating a value without ever seeing it** (PowerShell): create 48 random bytes, base64 them, and pipe them straight into `wrangler secret put`. The production secrets were set up this way.

**Handover-day rotation list (do all of these):** `SESSION_SECRET`, `INTERNAL_SECRET` (both Workers), `RESEND_API_KEY` (a new key in the **owner's** Resend account), `ALERT_EMAIL` (the owner's or the developer's, as agreed), the developer's own admin password (or switch the account off), and any Cloudflare API tokens created along the way.

## Backups and restore

Details and reasons are in [ADR 016](./adr/016-production-security-backups.md). In short:

- **D1 Time Travel**: every change in the last 30 days, to the minute, built in. For "I just broke something".
- **Nightly files** in `ffa-prod-backups`: `db/YYYY-MM-DD.ndjson.gz` (kept 30 days, newest three always kept) and `media/...` (a copy of every photo). For "the database is gone" and for reading the data without Cloudflare.
- **Export my data** (Settings): the owner's spreadsheets. Not a restore source.

### Undo a bad change (Time Travel)

```powershell
cd apps/api
npx wrangler d1 time-travel info DB --env production                 # shows the current bookmark
npx wrangler d1 time-travel info DB --env production --timestamp "2026-12-01T14:00:00Z"   # the bookmark for a past moment
npx wrangler d1 time-travel restore DB --env production --bookmark=<bookmark>           # or --timestamp
```

Restoring replaces the whole database with how it was at that moment, so **anything entered since is lost**. Time Travel gives back the bookmark you left, so a restore can itself be undone: note the current bookmark first.

### Restore from a backup file (the database was deleted or damaged beyond Time Travel)

This was rehearsed on 12 Nov 2026 (staging backup restored into a throwaway database, row counts matched).

1. Download the newest good file:
   `npx wrangler r2 object get ffa-prod-backups/db/2026-12-01.ndjson.gz --file backup.gz --remote`
   (list what exists with `npx wrangler r2 object get` on a known date, or in the dashboard, R2, `ffa-prod-backups`, `db/`).
2. Make an **empty** database and migrate it. If `ffa-prod` is gone, `npx wrangler d1 create ffa-prod`, put the new `database_id` in `apps/api/wrangler.jsonc` (the `production` block), then `pnpm db:migrate:production`. To rehearse, create a throwaway database and apply the migrations by joining `packages/db/migrations/*.sql` in order into one file and running `wrangler d1 execute <name> --remote --file all.sql`.
3. Turn the backup into SQL: `pnpm --filter @ffa/api restore-backup backup.gz restore.sql`.
4. Apply it: `npx wrangler d1 execute ffa-prod --remote --file restore.sql`. It clears the few tables the migrations seed (categories, fields, counters, placeholder pages), then inserts every row, parents first. The database's append-only rules make this **refuse to run against a database that already holds sales or stock history**, so it can't be pointed at a live one by mistake.
5. Redeploy the API if the database id changed, then sign in and check the dashboard, a few pieces and the last sale.
6. The restored data is as of the backup time. Sales made on the phones since then are not in it: the POS app keeps its queue, and anything recorded but not yet sent can be re-entered from the staff's memory or the card reader's records.

### Restore photos

The media bucket is never changed by a database restore. If it was lost: copy `media/<key>` objects from `ffa-prod-backups` back to `ffa-prod-media` under the key without the `media/` prefix (`wrangler r2 object get` then `put`, or `rclone` against R2's S3 interface, which is quicker for many files). Files the owner deleted on purpose are also still in the backup, so only restore what is missing.

### Drill

Repeat the restore rehearsal on **production data** once before handover, and again after any change to the schema or the backup code (a test covers the round trip, but a drill covers the people and commands).

## Monitoring and alerts

- Every 15 minutes the API Worker checks the database, the photo storage, the website and the age of the last backup. After **two** bad checks in a row it emails `ALERT_EMAIL`, repeats once a day while it stays broken, and says when it recovers. Alerts are headed `[production]` or `[staging]` and say which check failed.
- It cannot notice a total Cloudflare outage, or the API Worker itself being down. Add a **free outside monitor** (UptimeRobot, or similar) on the developer's email, watching `https://forestfae.ca/healthz` and `https://api.forestfae.ca/health`, with an email alert. Do this before handover and write the monitor's account into the inventory.
- A failed backup is reported by the same check (a backup older than 36 hours, or a failed run).
- The first run in a new environment makes the first backup by itself.

## Common tasks

| Task | How |
|---|---|
| Add a person | Admin, Users, fill in the form, "Add and get link", pass on the private link |
| The first administrator on a new database | `apps/api/scripts/create-user.ts` (its header shows the command). It writes SQL with only a password **hash**; apply it with `wrangler d1 execute DB --env production --remote --file .tmp/create-user.sql`, then delete the file |
| A user forgot their password | Admin, Users, the person's row, send a new link |
| Switch a person off | Admin, Users. Their history stays |
| Take the developer off the administrator list at handover | Create the owner's administrator account first and check it works, then switch the developer's account off (the system refuses to remove the last administrator) |
| Change a setting that is not in the admin | Settings are rows in the `setting` table (JSON values). Prefer the admin screen. If you must, use `wrangler d1 execute` and add an audit entry by hand |
| Upgrade to Workers Paid | Cloudflare dashboard, Workers & Pages, Plans (the account owner pays). No code changes. Afterwards the photo-backup catch-up can copy more per run (`copyMissingMedia`'s budget in `services/monitor.ts`) |
| Renew the domain | Cloudflare dashboard, Domain Registration, Manage Domains. Auto-renew should be on |
| Change the website's address | **Don't.** Printed QR codes point at it. If it ever must change, the old address has to keep redirecting forever and `qrBaseUrl` in Settings changes only after that |
| Retake the guide screenshots | Run the stack locally (staging.md), sign in, and save 1280×800 screenshots of the five pages named in `apps/web/lib/guide.ts` into `apps/web/public/guide` |
| Build the Android app | See staging.md ("Making an installable APK") |
| Look up a reported error code | Dashboard, the API Worker, Logs, search the 8-character code |
| Check the audit log | Every change to money, stock, users, settings and exports is in `audit_log` (append-only) |

## When something is wrong

| What you see | Look at | Usually |
|---|---|---|
| Alert: **website** | `https://forestfae.ca/healthz`, the web Worker's logs, the last deploy | A bad deploy: roll back the web Worker. Otherwise a Cloudflare incident (check cloudflarestatus.com) |
| Alert: **database** or **media** | `https://api.forestfae.ca/health`, the API's logs | A Cloudflare incident, or a bad migration (roll back with Time Travel) |
| Alert: **backup** | The API logs for `backup-failed`, the Settings page's backup line | The backup bucket missing or full, or a table that changed shape. Run "Back up now" after fixing |
| "Something went wrong" with a code | Logs, search the code | The log line has the path and the real message |
| Customers can't submit the contact form | `inquiry-email-failed` in the logs, Resend's dashboard | The Resend key or domain verification. Inquiries are always saved first and can be answered from the admin |
| Email not arriving at `asa@` | Cloudflare, Email Routing | The destination address isn't verified, or the routing rule is off |
| Phones can't sell | `/health`, then the POS app's More tab | The app keeps sales and sends them later. Nothing is lost while the API is down |
| Labels won't print from the browser | The Printer test page | Chrome on Android only. Fall back to the PDF or PNG label |

## If the developer is unavailable (HAND-8)

For the owner, or a developer helping them, if the usual developer can't be reached.

1. **Nothing is lost while nobody is looking.** The website, the admin and the POS app keep working. Backups run nightly. The phones keep unsent sales.
2. **Who to ask:** the owner has the developer's contact details and the name of anyone the developer has asked to help. Write them here at Stage 1: *[developer to fill in: backup contact and how to reach them]*.
3. **Getting into the hosting account:** the owner is a member of the Cloudflare account with full access (Stage 1). The **second recovery contact and the recovery codes** are kept with the owner's own records, in a place the developer and owner agree on: *[to fill in at handover: where]*.
4. **A new developer** needs: this repository (GitHub), the Cloudflare account membership, and the [account inventory](#account-inventory-hand-1). They can deploy with the commands above, restore from the backups, and rotate secrets without anyone's help. `pnpm install`, `pnpm test` and `pnpm build` must pass on their machine before they change anything.
5. **Costs and renewals** that need action if nobody does it: the domain (due late 2029, auto-renew on), the Workers plan if it was bought, and the Resend free tier limits.
6. **Registrar lock and auto-renew** stay on. Billing alerts are set on the account to the owner's email at Stage 2.

## Stage 2: passing the Cloudflare account to the owner (HAND-2)

**Target date: 31 January 2027** (proposed, to confirm with the owner at handover). Not urgent: the domain is prepaid, and the owner is already a member with full access from handover day.

Because the domain, DNS, Workers, D1, R2 and Email Routing are already in one account, **nothing is migrated**. Printed QR codes, email and the website are unaffected.

1. Agree the date with the owner. The owner needs a Cloudflare login on their own email address.
2. Confirm the owner can sign in and see everything (they are a member from Stage 1).
3. In the Cloudflare dashboard, Manage Account, Members: make the owner **Super Administrator**. (If Cloudflare requires a transfer instead, use its account ownership transfer flow and follow its prompts.)
4. Move billing: Billing, Payment Info. The owner enters their card and the developer's is removed. Check the Workers plan (if Paid) and any other subscriptions come with it. Set **billing alerts** to the owner's email.
5. Domain registrant: Domain Registration, the domain, review the registrant details. A `.ca` domain needs a Canadian-presence registrant, and the owner (a Canadian) is the natural one. Registrar lock and auto-renew stay on.
6. Decide the developer's role: remove, or keep as a support member with the least access needed.
7. Rotate what the developer knew: any Cloudflare API tokens, the EAS and GitHub access, and the alert email. (The Worker secrets were rotated at Stage 1.)
8. Check: the website, the API health, a test sale, an inquiry and an email still work, and `asa@` forwarding still works. The monitor and backups keep running.
9. Update the account inventory above, note the date here, and tell the owner who to call for help.

Rehearse step 3 and 4 with a throwaway second email before the real thing (kickoff spike 2): confirm the roles and the billing flow match what Cloudflare's dashboard shows that day.
