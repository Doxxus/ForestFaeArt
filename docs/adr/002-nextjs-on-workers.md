# ADR 002: Next.js on Workers (provisional)

Status: **provisional**. vinext spike in `spikes/next-workers` (throwaway, not part of the workspace).

## Verified live (31 Oct 2026, dedicated Cloudflare account, Workers **Free** plan)

- `npm run deploy` (vinext) deployed the spike to `*.workers.dev`. The tRPC route, Drizzle and a real D1 database all worked end to end (write and read back). The spike Worker and its D1 database were deleted afterwards.
- Deploys use the `cf` CLI login (`npx cf auth login`), which is separate from `wrangler login`.
- The account already had a `workers.dev` subdomain registered, so the dashboard onboarding link was not needed and 404ed. Changing the subdomain name was refused (HTTP 409).
- Password hashing fits the Free plan with native crypto: PBKDF2-SHA256 at 100,000 iterations (Workers rejects higher counts) and `node:crypto` scrypt via `nodejs_compat` at N=2^14 to 2^16, r=8 (about 0.2 s end to end). N=2^17 took about 1 s and uses about 128 MB, too close to the Worker memory limit. See ADR 003.

## Verified locally (31 Oct 2026)

- `npm create cloudflare@latest -- --framework=next` scaffolds a **vinext** app (Vite + `@cloudflare/vite-plugin`, `cloudflare.config.ts`).
- App Router route handler serving a **tRPC** fetch handler works (`/api/trpc/ping`, `/api/trpc/addNote`).
- **Drizzle** on a **D1** binding (`bindings.d1(...)` in `cloudflare.config.ts`, `env` from `cloudflare:workers`) works under `vite dev` with local D1 emulation.
- `vite build` succeeds with those routes.

## Findings and caveats

- Scaffold dependencies are `latest`/`beta` and unpinned. Pin exact versions when the real app is created.
- `cloudflare.config.ts` is in **open beta** and its format can change. Wrangler config remains a fallback.
- The generator wrote `compatibilityDate` using the next UTC day, which the local `workerd` rejected. Use a date the installed `workerd` supports.
- Creating a project on Windows ends with a harmless libuv assertion after the app is generated.

## Still to prove

1. The first-party auth layer under vinext (see [ADR 003](./003-auth.md)).
2. ~~A real deploy to the dedicated Cloudflare account.~~ Done, see above.
3. OpenNext comparison only if the auth layer or Workers Paid load testing fails under vinext.
