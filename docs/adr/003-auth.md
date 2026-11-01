# ADR 003: Authentication

Status: **accepted**. Updated 31 Oct 2026 after weighing Auth.js against a first-party layer.

Date: 31 Oct 2026.

## Context

The original plan was Clerk with MFA. In the Clerk dashboard, authenticator-app MFA and backup codes carry a **Pro** badge. A web search put Pro at about USD 25/month (USD 20 if billed annually, unverified against clerk.com). That cost would fall on the owner after handover and was not in the budget.

Auth.js was considered next. It is built around browser cookies, supports only token sessions for password sign-in, and has no built-in flow for a native bearer-token client such as the Android POS. It would also stack on top of the beta vinext route, and the lockout, reset, revocation and role checks would still be ours to write.

## Decision

- Build a small **first-party auth layer** in `apps/api` (shared code in `packages/auth`). No third-party auth account, no per-user fees, nothing to transfer at handover.
- Use vetted primitives only: `jose` for signed tokens, scrypt for passwords, WebCrypto for random tokens and constant-time comparison. No hand-rolled cryptography.
- **No MFA at launch.** MFA (TOTP and backup codes) is P2 (AUTH-9) and the design leaves room for it.
- Email and password sign-in for the owner (ADMIN) and one staff member (STAFF). Users are added by the ADMIN and receive a one-time set-password link.
- Keep the layer behind an `AuthService` interface so it can be replaced later.

## Design

- One mechanism for all clients: a signed **bearer token** (`jose`, HS256 with a Worker secret) holding only the user id, `sessionVersion`, issue time and expiry.
- **Web:** the token lives in an httpOnly, Secure, `SameSite=Strict` cookie on the web origin. The Next.js server reads it and calls the API over a service binding with the token as a bearer header. Mutations also require a JSON content type and an Origin check, which together with `SameSite=Strict` covers CSRF.
- **POS:** the app stores the token in the Android keystore (Expo SecureStore) and sends it as a bearer header. A device stays signed in for the event day (POS-1).
- Passwords are hashed with **scrypt** (`node:crypto` under `nodejs_compat`, N=2^16, r=8, p=1, about 64 MB). The spike showed this runs in about 0.2 s on Workers Free. PBKDF2 is capped at 100,000 iterations by Workers, which is below current OWASP guidance, so it is only a fallback. Hashes are stored in a self-describing format (`scrypt$N$r$p$salt$hash`) so parameters can be raised later and old hashes upgraded on sign-in.
- On **every** request the API loads the `User` row and rejects inactive users, a mismatched `sessionVersion`, or a role that does not allow the procedure. Incrementing `sessionVersion` revokes all of a user's sessions (AUTH-5). Role is never read from the token.
- Set-password and reset links use random 256-bit tokens, stored only as a hash, single use, with a short expiry.

## Compensating controls for no MFA (AUTH-8)

Password length minimum and common-password check, per-account and per-IP rate limiting with temporary lockout, uniform error messages, audit-logged sign-ins, password changes and role changes, and short idle expiry for the admin web session. The owner-facing Owner Guide recommends a long unique password.

## Risks

Token signing, cookie flags, CSRF, reset links, lockout and session handling are security-sensitive code written by us, and mistakes fail silently. Mitigations: a small surface, unit tests for every rule in `packages/auth`, and a security review in Phase 8. There is no community scrutiny, so the code must stay simple and documented.

## Consequences

- We own password storage, reset flow and rate limiting, so they need unit and integration tests.
- Password reset and set-password links depend on the email provider (spike 5).
- Adding MFA later means a TOTP secret on the user record and a second step in sign-in.
- Adding Google sign-in later is more work than with Auth.js, and is not planned.
- The Clerk dev instance used for early testing is no longer needed and should be deleted, and its keys revoked.

