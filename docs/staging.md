# Staging environment

Staging lives in the dedicated, project-only Cloudflare account (HAND-0, HAND-2). It is for development and testing only. It holds no real data, is not indexed, and is not linked from anywhere.

| Resource | Name | Notes |
|---|---|---|
| API Worker | `ffa-api-staging` | https://ffa-api-staging.forestfaefolk.workers.dev. `GET /health`, tRPC at `/trpc` |
| Web Worker | `ffa-web-staging` | https://ffa-web-staging.forestfaefolk.workers.dev. Placeholder page, `noindex` and `robots.txt` disallow all |
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

Staging has migrations `0000` to `0005` applied (3 Nov 2026): the full data model, the append-only triggers, the reference data (8 categories, 9 metadata fields, the `sku` and `sale` counters), placeholder website content, and the inquiry delivery-error columns. The first ADMIN exists. Further users are invited from the admin app (`users.invite` returns a set-password link, `WEB_ORIGIN` builds it).

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

What is already built (API): `inquiries.submit` accepts an optional `turnstileToken`. When the Worker secret `TURNSTILE_SECRET` is set, the API verifies every token with Cloudflare and rejects the message if it fails. When it is not set, the check passes. No code change is needed on the API.

To switch it on:

1. Cloudflare dashboard > **Turnstile** > Add widget. Hostnames: `forestfae.ca` (and `ffa-web-staging.forestfaefolk.workers.dev` for testing). Mode: Managed. Copy the **site key** (public) and **secret key**.
2. `wrangler secret put TURNSTILE_SECRET --env staging` in `apps/api` (and the same without `--env` at production cut-over). Paste the secret key.
3. In the public contact form (Phase 4, not built yet), render the Turnstile widget with the site key and send its token as `turnstileToken`. **Phase 4 must build the form so the widget appears only when a site key is configured** (a public environment setting). Then steps 2 and 3 are safe in either order. If the secret is set before the form sends tokens, every message is rejected.
4. Test: submit the form on staging, then try a request with no token and confirm it is rejected.

Test-only keys that always pass or fail are in [Cloudflare's docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## Not set up yet

- A staging custom domain such as `staging.forestfae.ca` (waits for the domain move and zone build-out).
- Access control in front of staging (Cloudflare Access) once the custom domain exists. Until then staging holds only a placeholder page and an empty database.
- A production environment. It is created at cut-over in Phase 8.
- Error reporting, uptime checks and D1 backups (Phase 8).
