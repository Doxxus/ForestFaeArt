# Staging environment

Staging lives in the dedicated, project-only Cloudflare account (HAND-0, HAND-2). It is for development and testing only. It holds no real data, is not indexed, and is not linked from anywhere.

| Resource | Name | Notes |
|---|---|---|
| API Worker | `ffa-api-staging` | https://ffa-api-staging.forestfaefolk.workers.dev. `GET /health`, tRPC at `/trpc` |
| Web Worker | `ffa-web-staging` | https://ffa-web-staging.forestfaefolk.workers.dev. Placeholder page, `noindex` and `robots.txt` disallow all |
| D1 database | `ffa-staging` | id `8669cdae-fe0c-4f3b-aca1-b0ffb443068b`, bound as `DB` in the API Worker |
| Worker secret | `SESSION_SECRET` | On `ffa-api-staging`. Random 48 bytes, set with `wrangler secret put`. Never stored in the repo |
| Worker secret | `INTERNAL_SECRET` | On **both** `ffa-api-staging` and `ffa-web-staging` (same value). Lets the web app forward visitor addresses to the API for rate limiting ([ADR 009](./adr/009-admin-web-app.md)). Rotate with `wrangler secret put INTERNAL_SECRET --env staging` and `... --name ffa-web-staging` |
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

Staging has migrations `0000` to `0003` applied (3 Nov 2026): the full data model, the append-only triggers, and the reference data (8 categories, 9 metadata fields, the `sku` and `sale` counters). There are no users yet. The first ADMIN is created with `create-user`, after which further users are invited from the API (`users.invite` returns a set-password link, `WEB_ORIGIN` builds it).

API tests (`pnpm test` in `apps/api`) run against a throwaway local D1 with every migration applied. They never touch staging.

## Not set up yet

- A staging custom domain such as `staging.forestfae.ca` (waits for the domain move and zone build-out).
- Access control in front of staging (Cloudflare Access) once the custom domain exists. Until then staging holds only a placeholder page and an empty database.
- A production environment. It is created at cut-over in Phase 8.
- Error reporting, uptime checks and D1 backups (Phase 8).
