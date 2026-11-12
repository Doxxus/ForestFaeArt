# Handover plan

How the gift is handed over on or before **25 December 2026** (HAND-0 to HAND-8). The [runbook](./runbook.md) has the commands. Tick things off as they are done. Nothing owner-facing is sent, and the owner is asked for nothing, until handover day (HAND-0).

## Where things stand (12 Nov 2026)

| | State |
|---|---|
| Production environment | Live at https://forestfae.ca and https://api.forestfae.ca, behind "Coming soon", `noindex`, `robots.txt` disallowing everything |
| Production database | Migrated (0000 to 0007), **empty**: no sample data, no users, no products |
| Backups and monitoring | Built. Nightly backup and 15-minute check are scheduled on production |
| Production secrets | `SESSION_SECRET`, `INTERNAL_SECRET` set. **Still to set:** `RESEND_API_KEY`, `ALERT_EMAIL` |
| First administrator | **Not created yet** |
| Real inventory | **Not imported yet** (waiting for the owner's spreadsheet) |
| Email Routing for `asa@` | **Not set up** (the destination must be verified by the owner on the day) |
| POS app | Production build profile points at `api.forestfae.ca`. **No production build made yet** |

## Before handover day (developer)

### Production set-up that needs the developer, not the code

- [ ] **Set `RESEND_API_KEY` on production**: `cd apps/api; npx wrangler secret put RESEND_API_KEY --env production` and paste a sending-only key restricted to `forestfae.ca` (a new key in the developer's Resend account, so the staging key can be rotated separately).
- [ ] **Set `ALERT_EMAIL` on production** to the developer's address: `npx wrangler secret put ALERT_EMAIL --env production`.
- [ ] **Create the developer's administrator account on production.** Use `apps/api/scripts/create-user.ts` (header shows the command) with a password only you know, apply the SQL with `--env production --remote`, delete the file. Sign in at https://forestfae.ca/login.
- [ ] **Add the outside uptime monitor** (UptimeRobot or similar) on `https://forestfae.ca/healthz` and `https://api.forestfae.ca/health`, emailing the developer. Add it to the account inventory.
- [ ] Check the **registrar lock and auto-renew** for `forestfae.ca`, and set **billing alerts** on the Cloudflare account.
- [ ] Send a **test alert** end to end: temporarily break nothing, but check one real email arrives by running the monitor with a deliberately wrong `WEB_ORIGIN` on staging with `ALERT_EMAIL` set, then put it back. (The logic is tested, the delivery is not.)
- [ ] In the admin on production: **Settings**, set the business name, emails (`asa@forestfae.ca`, `noreply@forestfae.ca`), the website address (`https://forestfae.ca`, which is what QR codes use), social links and phone. Run the **Setup Wizard** once so it is understood, then press "Start the wizard again" so the owner sees it on the day.
- [ ] Check **Settings, Your data and backups** shows a backup after the first night, and that `ffa-prod-backups` holds `db/` and `media/`.

### Data readiness (HAND-7)

- [ ] Get the owner's real inventory spreadsheet (**blocked: waiting for it**) and import it with Import (Appendix A format). Use the preview, check the counts, confirm. Import can be undone.
- [ ] **No sample data** on production (Settings shows "Add the sample data" and not "Remove"). It was never loaded.
- [ ] Real **categories** and fields reviewed. Products have **no photos** yet and show the standard placeholder (IMG-9).
- [ ] About, Contact and other pages hold the lorem ipsum placeholder copy. The site stays **hidden** (Coming soon), `siteLive` off.
- [ ] A **test sale to undo**: sell a piece in the POS app against production and undo it, so the audit trail shows the test and stock returns. Do this last, and check the piece is back to Available.
- [ ] SKUs: the first real piece should be `FFA-000001` (no samples loaded means no numbers burned).

### Labels and printing (after the domain is live: it is)

- [ ] Settings website address is `https://forestfae.ca` (QR-6). Labels printed against it carry **no** TEST mark. Labels made against staging do.
- [ ] Print one real label on the B1 from production, scan it with a phone, and check it opens the right piece on `forestfae.ca`.
- [ ] The first batch of real labels is printed **on the day** (decision 35), plus the test prints already done.
- [ ] Pack: the **NIIMBOT B1** (gift), 2 to 3 spare 40×30 mm rolls, a charging cable.

### The POS app

- [ ] Make the production APK: `cd apps/pos; pnpm dlx eas-cli build --platform android --profile production` (see staging.md). Install it on the developer's own phone and run a full test sale and undo against production.
- [ ] Download and store the **Android signing key** (`eas credentials`), with the owner's recovery information (HAND-3).
- [ ] The EAS preview build for staging is still open from Phase 6. It is not needed for handover.

### Rehearsal (do once, on staging, with a second email for the "owner")

- [ ] Run the whole **handover-day list below** on staging, start to finish, with a throwaway email standing in for the owner, and a second phone. Time it. Fix anything that was awkward in the Owner Guide.
- [ ] Rehearse **Stage 2** steps 3 and 4 (members and billing) with a throwaway second Cloudflare login, to confirm the dashboard still matches the runbook.
- [ ] Do the **restore drill** on production data (runbook, "Drill").
- [ ] Run Lighthouse (mobile) on https://forestfae.ca while signed in (or briefly published): the budget is performance 90 or more, LCP 2.5 s or less, CLS 0.05 or less ([ADR 012](./adr/012-public-site-redesign.md)).

## Handover day (HAND-4)

The owner and the staff member are onboarded **together**, in person or on a call. In this order:

1. [ ] **Create the owner's account**: Admin, Users, add the owner as Administrator, pass on the private link, they choose their own password. Then the staff member as Staff.
2. [ ] **`asa@` forwarding (EML-1):** in Cloudflare, Email Routing, add `forestfaefolkart@gmail.com` as a destination. The owner opens the verification email in Gmail and confirms. Check a test message to `asa@forestfae.ca` arrives.
3. [ ] **The owner's email sending account (Resend):** the owner creates their own account, adds `forestfae.ca`, the developer re-verifies the DNS records if needed, and a **new sending-only key** replaces the developer's (`wrangler secret put RESEND_API_KEY --env production`). Send a test from the contact form.
4. [ ] **Install the POS app** on both Android phones (the production APK link). Sign in as each person.
5. [ ] **Install the NIIMBOT app** (for the PDF/PNG fallback) and **pair the B1**. Print a **test label** and **scan** it with a phone and in the POS app.
6. [ ] **A test sale**: sell a real piece with the POS app, then **undo** it and see the piece come back.
7. [ ] **Show the Owner Guide** (admin, Guide): products, photos, labels, selling, "if something goes wrong". Hand over the printed **staff quick-start** and **market-day checklist**.
8. [ ] **Who holds what:** say plainly that the developer holds the domain and hosting for now, that the owner is a member with full access, and that the account is passed over on the Stage 2 date (target 31 Jan 2027), with nothing changing for the website, email or QR codes. Show Settings, "Your data and backups".
9. [ ] **Show how to take real photos and add them**: photograph a piece, Add photos on its page, describe it, mark it Available, "Show on the website".
10. [ ] **Show what was pre-loaded:** inventory, settings and the placeholder copy, and "Start the wizard again" to walk through the basics together.
11. [ ] Leave the website **hidden**. The owner replaces the placeholder text, adds photos, checks "Before you publish" in Settings, and presses **Publish my website** at their own pace.

## Secret rotation on the day (HAND-3)

After the owner's accounts work, rotate everything the developer knew during the build. The list and commands are in the runbook ("Handover-day rotation list"). Then:

- [ ] Switch off or downgrade the developer's administrator account on production (create the owner's first, and check it works).
- [ ] Hand over (or store safely, as agreed) the Android signing key.
- [ ] Update the account inventory in the runbook with the owner's accounts and the date.

## After handover

- [ ] Free **30-day bug-fix period**, then ad hoc support. Costs and who pays are settled after handover (decision 32).
- [ ] **Stage 2**, target **31 January 2027**: runbook, "Stage 2".
- [ ] Later and separate: Square card-reader integration, Etsy sync, then e-commerce (none is mentioned to the owner until it exists).
