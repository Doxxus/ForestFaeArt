# Staging environment

Staging lives in the dedicated, project-only Cloudflare account (HAND-0, HAND-2). It is for development and testing only. It holds no real data, is not indexed, and is not linked from anywhere.

| Resource | Name | Notes |
|---|---|---|
| API Worker | `ffa-api-staging` | https://ffa-api-staging.forestfaefolk.workers.dev. `GET /health`, tRPC at `/trpc` |
| Web Worker | `ffa-web-staging` | https://ffa-web-staging.forestfaefolk.workers.dev. The admin app and the public website (hidden behind "Coming soon" until published). `noindex`, and `robots.txt` disallows everything on staging |
| D1 database | `ffa-staging` | id `8669cdae-fe0c-4f3b-aca1-b0ffb443068b`, bound as `DB` in the API Worker |
| Worker secret | `SESSION_SECRET` | On `ffa-api-staging`. Random 48 bytes, set with `wrangler secret put`. Never stored in the repo |
| Worker secret | `INTERNAL_SECRET` | On **both** `ffa-api-staging` and `ffa-web-staging` (same value). Lets the web app forward visitor addresses to the API for rate limiting ([ADR 009](./adr/009-admin-web-app.md)). Rotate with `wrangler secret put INTERNAL_SECRET --env staging` and `... --name ffa-web-staging` |
| Worker secret | `RESEND_API_KEY` | On `ffa-api-staging`. Sending-only key for `forestfae.ca`. Without it email stays PENDING. Rotate with `wrangler secret put RESEND_API_KEY --env staging`. See [Email](#email) |
| Worker secret (not set) | `TURNSTILE_SECRET` | Deliberately not set yet. See [Turnstile](#turnstile-not-switched-on-yet) |
| R2 bucket | `ffa-staging-media` | Bound as `MEDIA` in the API Worker. `/health` checks it. Public access is off (images will be served through the API or Worker, never a public bucket) |

The `workers.dev` subdomain `forestfaefolk` was already registered on the account and cannot be changed.

## Logins you need

Two separate CLI logins are used (both with the dedicated account):

- `npx wrangler login`: used by `wrangler` for the API Worker, D1 and secrets.
- `npx cf auth login`: used by `vinext-cloudflare deploy` for the web Worker.

## Common tasks

Run these from `apps/api` unless noted.

| Task | Command |
|---|---|
| Run the API locally | `pnpm dev` (needs `.dev.vars` with a `SESSION_SECRET` of 32+ characters, git-ignored) |
| Apply migrations locally | `pnpm db:migrate:local` |
| Apply migrations to staging | `pnpm db:migrate:staging` |
| Deploy the API to staging | `pnpm deploy:staging` |
| Create a user (local or staging) | see the header of `scripts/create-user.ts`. The password comes from an environment variable and only its hash is written |
| Deploy the web app to staging | `pnpm deploy:staging` in `apps/web` |
| Change the staging secret | `wrangler secret put SESSION_SECRET --env staging` (this signs everyone out) |

After changing `packages/db/src/schema.ts`, run `pnpm db:generate` in `packages/db` to create a migration, review the SQL, then apply it. Hand-written SQL (triggers, reference data) goes in a migration made with `pnpm exec drizzle-kit generate --custom --name <name>`.

## Running everything locally

1. `pnpm install`, then in `apps/api`: `pnpm db:migrate:local`, create a local admin with `create-user` (see its header), and start the API with `pnpm dev` (port 8787).
2. Create `apps/web/.env.development.local` containing `VITE_API_URL=http://localhost:8787` (git-ignored). Without it, the dev server uses the staging API.
3. In `apps/web`: `pnpm dev`. Open the printed address and sign in.

The local database lives in `apps/api/.wrangler` (git-ignored) and never touches staging.

## Database state

Staging has migrations `0000` to `0007` applied (`0006` on 4 Nov 2026, `0007` on 12 Nov): the full data model, the append-only triggers (changed in `0007` so that only rows belonging to sample pieces can be deleted, see [ADR 015](./adr/015-setup-wizard-samples-help.md)), the reference data (8 categories, 9 metadata fields, the `sku` and `sale` counters), placeholder website content, the inquiry delivery-error columns, and the sale discount-reason and undo columns. The first ADMIN exists. Further users are invited from the admin app (`users.invite` returns a set-password link, `WEB_ORIGIN` builds it).

API tests (`pnpm test` in `apps/api`) run against a throwaway local D1 with every migration applied. They never touch staging.

## Email

Outgoing email goes through Resend ([ADR 010](./adr/010-events-content-inquiries.md)). Notifications are sent From `noreply@forestfae.ca` to the inquiry address, and replies From `asa@forestfae.ca` (both set in Settings).

DNS records on `forestfae.ca` (Cloudflare DNS, DNS only, not proxied):

| Record | Name | Purpose |
|---|---|---|
| TXT | `resend._domainkey` | DKIM key from Resend |
| MX and TXT | `send` | Resend's bounce handling and SPF for the `send` sub-domain |
| TXT | `_dmarc` | `v=DMARC1; p=none;` (monitor only). Tighten to `p=quarantine` once real mail has flowed cleanly for a few weeks |
| MX and TXT | root (`forestfae.ca`) | Added automatically by Cloudflare Email Routing so `asa@forestfae.ca` forwards to a real inbox. There must be only **one** SPF record on the root name, so let Email Routing create it and merge anything else into it |

Until the handover, `asa@` forwards to the developer's mailbox. At handover, change the destination to the owner's address (Email Routing, Destination addresses) and verify it.

To check email works: set `siteLive` on staging, submit the contact form (or `inquiries.submit`), look for the notification, reply from the admin app, then switch `siteLive` back off.

**Verified on staging, 3 Nov 2026:** the notification, an admin reply, and a visitor reply coming back through `asa@` all worked. Testing from the same Gmail account that `asa@` forwards to triggers a harmless Cloudflare notice (Gmail hides mail sent from its own account). Use a different address to test the return path properly.

## Turnstile (not switched on yet)

Cloudflare Turnstile is a free, mostly invisible "are you a person" check for the public contact form (WEB-7). It is **deliberately off for now**. The form is already protected by a hidden trap field, a limit of 5 messages per hour per visitor, and the form only working while the site is live. Turn Turnstile on if spam appears, or before launch if the owner prefers.

What is built: `inquiries.submit` (API) accepts an optional `turnstileToken`. When the Worker secret `TURNSTILE_SECRET` is set, the API verifies every token with Cloudflare and rejects the message if it fails. When it is not set, the check passes. The public contact and "Ask about this piece" forms (`apps/web/components/site/inquiry-form.tsx`) show the widget whenever `VITE_TURNSTILE_SITE_KEY` is set, and the browser adds the token to the form by itself.

To switch it on:

1. Cloudflare dashboard > **Turnstile** > Add widget. Hostnames: `forestfae.ca` (and `ffa-web-staging.forestfaefolk.workers.dev` for testing). Mode: Managed. Copy the **site key** (public) and **secret key**.
2. Put the site key in `apps/web/.env.production` as `VITE_TURNSTILE_SITE_KEY=<site key>` (the file has a commented-out line for it) and redeploy the web app (`pnpm deploy:staging` in `apps/web`). The site key is public, so it is fine in that file. Check the widget appears on the contact form.
3. Only now, `wrangler secret put TURNSTILE_SECRET --env staging` in `apps/api` (and the same without `--env` at production cut-over). Paste the secret key. **Do this after step 2**: with the secret set but no widget on the form, every message is rejected.
4. Test: submit the form on staging, then send a request with no token (for example the API's `inquiries.submit` directly) and confirm it is rejected.

Test-only keys that always pass or fail are in [Cloudflare's docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## The public website

The public site is part of the web app ([ADR 011](./adr/011-public-site.md)). Things to know when running it:

- **It starts hidden.** Until the owner presses "Publish my website" (Settings), every public address shows a "Coming soon" page to visitors, and signed-in staff see the real site with a "Preview" banner. To look at staging as a visitor would, sign out first.
- **Search engines stay out of staging**, even when its site is published for testing: indexing needs `VITE_INDEXABLE=true`, which only production sets. `robots.txt` and `sitemap.xml` follow the same rule.
- **Per-environment settings** (`apps/web/.env.production`): `VITE_API_URL`, `VITE_SITE_URL`, `VITE_INDEXABLE`, `VITE_TURNSTILE_SITE_KEY` and `VITE_ANALYTICS_TOKEN`. The table is in ADR 011.
- **The art kit** is redrawn with `pnpm --filter @ffa/ui kit` (files in `apps/web/public/kit`, plus the favicon, touch icon and link-preview picture). The same command redraws the woodland scenery for the green-world look ([ADR 012](./adr/012-public-site-redesign.md)) into `apps/web/public/scene` and `lib/scene-manifest.ts`. The test in `packages/ui` fails if a committed file is out of date. Look at it all at `/admin/style-guide`.
- **The green world** (`apps/web/app/world.css`, `components/site/world.tsx`) is the look of every public page and the "Coming soon" page. To judge it on staging, sign in and browse the site in preview. To see the "still" version, turn on "reduce motion" in your device's accessibility settings: nothing moves and the leaves and insects are not shown. Scroll-driven motion needs a recent Chrome, Edge or Safari; elsewhere the still scene is shown.
- **To test the public site locally:** start the API (`pnpm dev` in `apps/api`), start the web app (`pnpm dev` in `apps/web`), publish the site in Settings, and open http://localhost:3100.

## Labels and the B1 printer

Label printing is in the admin under **Labels** ([ADR 013](./adr/013-label-printing.md)). Things to know:

- **Staging labels are test labels.** Anything made while the environment is not production, or while *Settings, Label web address* is not `https://forestfae.ca`, is stamped **TEST** and recorded as a test print. Test prints and real prints never count for each other, so printing a batch on staging does not make a real piece look labelled once production is live.
- **To scan-test labels against staging**, set *Label web address* to `https://ffa-web-staging.forestfaefolk.workers.dev`, print, scan with a phone, then set it back to `https://forestfae.ca`. (A signed-in phone is sent to the piece, an anonymous one sees the friendly "not on the website yet" page.)
- **Testing the B1 over Bluetooth** (spike 4, needs the Android phone and the B1): sign in on the phone in **Chrome**, open `/admin/labels/printer-test`, switch the B1 on, close the NIIMBOT app (it holds the connection), press *Connect*, pick the printer, then print the test card. If it prints sideways, change *Direction*. Then print a real label from **Labels** with *Print on the B1 (Bluetooth)*. Try a 40 x 30 and a 50 x 30 label. Send the connection log if anything fails.
- **If Bluetooth does not work**, the approved fallback is *Pictures for the NIIMBOT app*: it makes one PNG per label (a ZIP for several) that you open in the NIIMBOT app, which is what passed the print test on 31 Oct.
- **A4 sheets:** choose *A4 sheet*, set the margin, gap, cutting guides and start position, and print the PDF at **Actual size / 100%**, never "Fit to page".

## The POS app

The app is in `apps/pos` ([ADR 014](./adr/014-sales-and-pos.md)). It uses no custom native code, so **Expo Go** runs it while developing.

1. **One-time:** install **Expo Go** from the Play Store on the Android phone. Make a free account at https://expo.dev (needed later for builds, and to sign in to Expo Go).
2. In `apps/pos`, run `pnpm start`. A QR code appears in the terminal. Open Expo Go, scan it, and the app opens (the phone and the computer must be on the same Wi-Fi. If they can't see each other, run `pnpm exec expo start --tunnel`).
3. The app talks to **staging** by default. To use your local API instead, set `EXPO_PUBLIC_API_URL` (for example `http://192.168.1.20:8787`, the computer's address on the Wi-Fi) before `pnpm start`.
4. Sign in with a staff or admin account made with `create-user`.
5. To try offline selling, turn on airplane mode, make a sale (it says "Sale saved on this phone" straight away), turn airplane mode off, and watch the "waiting to send" message clear within about 20 seconds. Then open **Today** and check it is there.
6. **Print a label** in the app opens the web print screen in Chrome. Sign in to the admin in Chrome on that phone once, and printing works as in [Labels and the B1 printer](#labels-and-the-b1-printer).

**Making an installable APK** (for the owner's and staff phones at handover, HAND-4): `pnpm dlx eas-cli login`, then in `apps/pos` run `pnpm dlx eas-cli build --platform android --profile preview` (staging) or `--profile production`. EAS gives a private link to the APK. The production profile points at `https://api.forestfae.ca`, which is a placeholder until the production domain exists (Phase 8). `pnpm bundle:check` checks the app still bundles.

## The Setup Wizard, sample data and help

([ADR 015](./adr/015-setup-wizard-samples-help.md).)

- **The wizard** is at `/admin/setup` (administrator only). A card on the dashboard offers it until it is finished or "Not now" is pressed. Settings has *Carry on where you left off* and *Start the wizard again*. Before handover the developer walks through it, so it shows as finished; **to show the owner the wizard on handover day, press *Start the wizard again* in Settings.** Starting again doesn't change anything already saved.
- **Sample data** (four pieces, three events) is added and removed in **Settings, Sample data** or from wizard step 5. It is marked **Sample** everywhere in the admin, and hidden from visitors unless *Show the samples on my website* is ticked. **Remove it before the website is published**, unless the aim is a preview. Removing deletes the samples, their pictures, any practice sales made with only sample pieces, and nothing else. If a sample piece was sold in a sale with a real piece, it stays and the message says which sale.
- **Handover test sale (HAND-4):** a sample piece is a good one to use, because removing the samples later takes the practice sale with it. Use a *real* piece only if the sale should stay in the books.
- **SKUs are never reused.** Loading the samples uses up four numbers, so the first real piece after a load and removal won't be `FFA-000001`. If the first real piece must be number 1, load no samples on the production database (or reset the counter by hand before any real piece exists).
- **The pictures** are drawn in code. After changing the kit, run `pnpm --filter @ffa/ui kit` and commit `apps/api/src/media/sample-art.generated.ts` with the rest. A test fails if it is stale.
- **Help text** for each admin page is in `apps/web/lib/help.ts`. A test fails if a new admin page has none.
- **Cloudflare's free plan allows 50 database queries per request.** The sample loader and remover are written to stay well under that (about 8 queries each, plus one batch).

## Not set up yet

- A staging custom domain such as `staging.forestfae.ca` (waits for the zone build-out).
- Access control in front of staging (Cloudflare Access) once the custom domain exists.
- A production environment. It is created at cut-over in Phase 8.
- Error reporting, uptime checks and D1 backups (Phase 8).
