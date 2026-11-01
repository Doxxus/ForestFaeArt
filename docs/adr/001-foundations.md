# ADR 001: Foundational decisions

Status: accepted by the developer on 31 Oct 2026.

## Decisions

- Monorepo with pnpm workspaces and Turborepo. TypeScript 6 (typescript-eslint does not yet support TS 7).
- IDs are ULIDs. SKU is `FFA-` plus six digits (`FFA-000123`), generated from an atomic counter.
- Money is integer CAD cents. Timestamps are UTC.
- Cloudflare D1 + Drizzle is the only datastore. Business writes use `db.batch()` with guarded updates, since D1 has no interactive transactions.
- First-party sessions for auth, with no MFA at launch (see [ADR 003](./003-auth.md)). The API verifies the session itself and takes the role from the `User` table.
- `apps/api` is a separate Cloudflare Worker (tRPC). Web and POS are API consumers.
- Next.js on Workers: spike **vinext first**, then OpenNext, and choose on evidence (ADR 002).

## Consequences

Changing ID, SKU or money formats after data exists is costly, so these are fixed now. See [phase0-kickoff.md](../phase0-kickoff.md) for tradeoffs and risks.
