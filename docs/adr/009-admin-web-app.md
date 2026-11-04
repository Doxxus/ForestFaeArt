# ADR 009: Admin web app

Status: **accepted** (3 Nov 2026, Phase 2). Built and deployed to staging.

## Decision

- **The web Worker is the only thing the browser talks to.** Pages are server components that call the API over HTTPS with a typed tRPC client (`@ffa/api-types`). Changes are server actions (plain `<form action>`), so every form also works without JavaScript and nothing in the browser holds an API token.
- **Sessions are an httpOnly cookie.** After `auth.login`, the web app stores the API's session token in `ffa_session` (`HttpOnly`, `Secure` in production, `SameSite=Lax`, 12 hours). JavaScript cannot read it. The API stays the authority: it re-checks the user, role and session version on every call, so an expired, revoked or tampered token just sends the person to the sign-in page. `requireUser()` guards every admin page, and `requireUser({ admin: true })` guards the ADMIN-only ones, on top of the API's own checks.
- **Photo uploads go through `POST /admin/upload`** on the web origin, which checks the request came from this site (Origin header) and forwards the bytes to the API with the token. The browser prepares the photo first (HEIC to JPEG, upright, shrunk to 2,400 px if large, up to 3 tries with a visible status), see [ADR 007](./007-photos.md).
- **The visitor's address is forwarded for rate limiting.** Calls from the web Worker reach the API from Cloudflare, not from the visitor, so without help every sign-in would share one per-IP limit and anyone could lock everyone out. The web app sends `x-ffa-client-ip`, and the API believes it only when the request also carries `x-ffa-internal` equal to the shared secret `INTERNAL_SECRET` (a Worker secret on both Workers, compared in constant time). Anyone else cannot choose their own address. This is tested in `apps/api/test/api.test.ts`.
- **One-time links are never put in an address.** After inviting someone, the link is held in a `SameSite=Strict`, `HttpOnly` cookie scoped to `/admin/users` for two minutes and shown on the next page. Nothing is emailed before the handover session.
- **Configuration:** `VITE_API_URL` in `.env.development` and `.env.production` (committed, no secrets; production is the staging API until cut-over). A git-ignored `.env.development.local` can point the dev server at a local API.
- **Design:** Tailwind 4 with the brand tokens copied into the theme, and a test (`apps/web/tests/theme.test.ts`) that fails if they drift from `@ffa/ui` or if status colours fall below WCAG AA. Mobile first: 44 px tap targets, one column on phones, a no-JavaScript menu, visible focus, reduced-motion respected, plain-language labels, and confirmation (never a silent action) before anything destructive. Pieces with no photo show one identical placeholder drawn in code.

## What is built

Sign in and set password, dashboard (counts, needs-photos and Etsy reminders, ADMIN stock value), products (search, filter, sort, paging), add a piece, the piece editor (photos, details, status and stock, categories, extra details with new tags on the fly, history), categories, fields, users and links, settings (store mode, publish switch, business info, emails, tax), and the CSV import (preview, create-missing consent, results, rows-to-fix download, undo).

## Not built yet

- Security headers and a Content-Security-Policy (Phase 8 hardening, with the public site's needs known).
- Drag-and-drop photo reordering (move earlier and later buttons work now, which also suits keyboards and screen readers).
- Sales, customers and labels (Phases 5 and 6), and the public site ([Phase 4, ADR 011](./011-public-site.md)).

## Consequences

- Local development needs the API running (`pnpm dev` in `apps/api`) or a pointer at staging. See [staging.md](../staging.md).
- Server actions are called by id, so a deploy that changes an action invalidates a page left open in a browser. The person just reloads.
