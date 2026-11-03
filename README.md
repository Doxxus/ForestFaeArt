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
- `apps/web`: Next.js (vinext) site and admin on Cloudflare Workers. Placeholder page for now
- `apps/pos`: Expo Android point-of-sale app. Placeholder screen for now
- `packages/db`: Drizzle schema and D1 migrations (the full data model, see [ADR 006](./docs/adr/006-data-model.md))
- `packages/api-types`: type-only export of the API router for the web and POS apps
- `packages/validators`: shared Zod schemas and pure helpers (SKU, money, IDs)
- `packages/auth`: first-party auth rules (scrypt passwords, signed session tokens, role checks, lockout, login). See [ADR 003](./docs/adr/003-auth.md)
- `packages/label-engine`: QR and label rendering. See [ADR 004](./docs/adr/004-label-rendering.md) and [docs/label-print-test.md](./docs/label-print-test.md)
- `packages/ui`: brand kit and design tokens (starting with the [logo directions](./packages/ui/brand/logo-directions/README.md) awaiting approval)
- `docs/adr`: architecture decision records
- `spikes/`: throwaway experiments, not part of the workspace
