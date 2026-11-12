# Forest Fae Folk Art

Platform for the Forest Fae Folk Art business. See [build_prompt.md](./build_prompt.md), [functional_requirements.md](./docs/functional_requirements.md) and [docs/phase0-kickoff.md](./docs/phase0-kickoff.md).

## Setup

Requires Node 24 and pnpm (`npm i -g pnpm`).

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Layout

- `apps/api`: Cloudflare Worker with the tRPC API, D1 access and sign-in. See [docs/staging.md](./docs/staging.md)
- `apps/web`: Next.js (vinext) on Cloudflare Workers: the public website (`app/(site)`) and the admin (`app/admin`). See [ADR 009](./docs/adr/009-admin-web-app.md) and [ADR 011](./docs/adr/011-public-site.md). The admin has a Setup Wizard, sample data and a "?" help drawer on every page, see [ADR 015](./docs/adr/015-setup-wizard-samples-help.md). The public site's redesign is planned for Phase 9, see [ADR 012](./docs/adr/012-public-site-redesign.md)
- `apps/pos`: Expo Android point-of-sale app: scan, cart, record a sale, offline queue, receipts, undo, end of day. See [ADR 014](./docs/adr/014-sales-and-pos.md) and [docs/staging.md](./docs/staging.md#the-pos-app) to run it
- `packages/db`: Drizzle schema and D1 migrations (the full data model, see [ADR 006](./docs/adr/006-data-model.md))
- `packages/api-types`: type-only export of the API router for the web and POS apps
- `packages/validators`: shared Zod schemas and pure helpers (SKU, money, IDs)
- `packages/auth`: first-party auth rules (scrypt passwords, signed session tokens, role checks, lockout, login). See [ADR 003](./docs/adr/003-auth.md)
- `packages/label-engine`: QR and label rendering, templates and layouts, A4 sheet planning and PDF output. See [ADR 004](./docs/adr/004-label-rendering.md), [ADR 013](./docs/adr/013-label-printing.md) and [docs/label-print-test.md](./docs/label-print-test.md)
- `packages/ui`: brand kit and design tokens: logo directions, the SVG art kit (`pnpm --filter @ffa/ui kit` redraws it into `apps/web/public/kit`, and also the four sample-piece pictures into `apps/api/src/media/sample-art.generated.ts`, see [ADR 011](./docs/adr/011-public-site.md) and [ADR 015](./docs/adr/015-setup-wizard-samples-help.md))
- `docs/adr`: architecture decision records
- `spikes/`: throwaway experiments, not part of the workspace
