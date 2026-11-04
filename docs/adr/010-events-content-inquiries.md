# ADR 010: Events, website content, inquiries and email

Status: **accepted** (3 Nov 2026, Phase 3). API and admin screens built and tested. Email delivery is verified on staging through Resend (notification, reply and inbound via Email Routing).

## Decision

- **Events** are stored in UTC with an IANA time zone chosen from a short list of Canadian zones. Opening hours are stored per local day. Times are entered as local times for the event's place, so the owner never does time-zone arithmetic. Drafts are invisible to visitors, and `.ics` calendar files (`/events.ics`, `/events/<slug>.ics`) are served only for published events and only when `siteLive` is on.
- **Taking pieces to an event** goes through the inventory service's bulk `moveProducts`, so the usual transition rules, ledger rows and audit entries apply. Pieces that are `AVAILABLE` or `RESERVED` can be assigned, and wrap-up returns them to the status they had before. Nothing writes `product.status` except the inventory service.
- **Website content** lives in `content_block` rows (about, home teaser, contact, privacy, terms) seeded as lorem ipsum drafts by migration 0004. Each holds a heading, text, one optional picture and an `isDraft` flag. A block counts as a placeholder while it is flagged draft or still reads like lorem ipsum (`isPlaceholderText`), and the publish checklist lists every one.
- **The "Publish my website" checklist** (settings page) and the dashboard "needs your attention" list both come from one API procedure, `site.attention`, so they cannot disagree. Publishing is never blocked by the checklist, only warned about, because the owner decides.
- **Inquiries are saved first, emailed second.** `inquiries.submit` writes the row, then tries to send the notification. A provider failure never loses a message: the inquiry keeps `email_delivery_status` (`PENDING`, `SENT`, `FAILED`) and `email_error` (migration 0005), replies keep `delivery_status` and `delivery_error`, and the admin screens show both with a retry button.
- **The contact form is protected without annoying visitors:** only works when `siteLive`, a hidden honeypot field (`website`), a per-IP limit of 5 per hour (using the forwarded visitor address from [ADR 009](./009-admin-web-app.md)), and optional Cloudflare Turnstile when `TURNSTILE_SECRET` is set.
- **Email goes through a small provider interface** (`apps/api/src/email/provider.ts`), with Resend as the default and a null provider when `RESEND_API_KEY` is missing. With the null provider messages stay `PENDING` with a plain explanation, which is the state staging is in today. Notifications come From `systemFromEmail` (noreply@) to `inquiryEmail` (asa@) with Reply-To set to the visitor. Replies come From `replyToEmail` (asa@). Templates are plain text plus minimal HTML with all visitor text escaped.
- **Images** for events and content blocks reuse the photo pipeline ([ADR 007](./007-photos.md)) with one picture each, stored under `events/` and `content/`, uploaded by admins only.

## Tradeoffs

- No email queue yet. Sending happens inline with the request, and a failure is recorded for manual retry. A Cloudflare Queue would add moving parts for a shop that gets a handful of messages a week.
- Resend over Cloudflare Email Sending: Resend's free tier, deliverability tooling and simple API win for now. The provider interface keeps the option open.
- Only admins see inquiries. Staff accounts do not need customer messages.

## Not done yet

- A separate email ADR if the provider or domain setup changes. At handover, point Email Routing for asa@ at the owner's mailbox and verify it.
- Turnstile site and secret keys (the form works without them). Switch-on steps are in [staging.md](../staging.md#turnstile-not-switched-on-yet). **Phase 4's contact form must support an optional Turnstile site key.**
- The public pages that show events and content (Phase 4).

## Consequences

- Migrations 0004 and 0005 must be applied before deploying this API version.
- Until email is configured, inquiries and replies accumulate as `PENDING`. They send when the owner presses "Try sending it again" after configuration.
