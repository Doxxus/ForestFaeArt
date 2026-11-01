# Forest Fae Folk Art

Platform for the Forest Fae Folk Art business. See [build_prompt.md](./build_prompt.md), [functional_requirements.md](./functional_requirements.md) and [docs/phase0-kickoff.md](./docs/phase0-kickoff.md).

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

- `packages/validators`: shared Zod schemas and pure helpers (SKU, money)
- `docs/adr`: architecture decision records
