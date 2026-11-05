# ADR 014: Sales, customers and the POS app (Phase 6)

Status: **accepted** (4 Nov 2026, Phase 6). The API, the admin screens and the app are built, tested and deployed to staging (the app itself is run on a phone with Expo, see [staging.md](../staging.md#the-pos-app)). Still to do on real hardware: a run on the owner's and staff phones, which happens at handover (HAND-4).

## Decisions agreed with the developer (4 Nov 2026)

| Question | Decision |
|---|---|
| Label printing from the POS | **Open the web print screen in Chrome** (a "Print a label" button). Direct Bluetooth already works there ([ADR 013](./013-label-printing.md)), so the app needs **no native Bluetooth code** and can be developed in Expo Go. Native BLE in the app is a possible later upgrade. |
| What the phone keeps offline | **Every piece (all statuses) plus the events**, not only the event's pieces. The catalog is small (tens to a few hundred pieces), and it also covers a piece that was never assigned to the event, and explains why a sold or archived piece can't be sold. |
| Who can discount | **Admin and staff**, with a required reason, written to the audit log. |
| Staff undo window | **The same day** in the shop's time zone. The administrator can undo any sale. |
| Receipts | **Email (optional, via the email provider) plus the Android share sheet.** No printing (P2). |

## The sale (SALE-1, SALE-2, POS-2)

- **One atomic write.** `recordSale` (`apps/api/src/services/sales.ts`) puts the sale, its lines, the payment, every stock change with its ledger row, and the audit entry in one `db.batch()`. Stock still changes only through `services/inventory.ts` (`saleLineStatements`, and the new `voidLineStatements`), so the rule that only the inventory service writes quantity and status holds.
- **Never oversell.** The stock decrement is guarded (`quantity >= n` and a sellable status). A failed guard fails the ledger insert, so the whole batch, including the sale row, rolls back (INV-11). Tests cover a second sale of a unique piece, over-asking for a multiple, a cart where one line fails (nothing changes), and concurrent requests.
- **Prices come from the database, never the phone.** A discount is the only way to charge less, and it needs a reason (POS-5). A discount can't exceed the total. Tax is always 0 (SALE-5): the totals function has no tax calculation yet, which is the P2 item.
- **Idempotent.** Each sale carries a client key with a unique index. Sending it again returns the first sale (`duplicate: true`) and changes nothing. Two identical requests at once are safe: the loser of the unique index looks up the winner. This is what makes retrying after a lost reply safe.
- **Sale numbers** come from the `sale` counter and are never reused. A failed sale can leave a gap in the numbers, which is accepted (a receipt number only has to be unique).
- **Time.** The device sends when the sale happened (`occurredAt`). A time in the future or more than 14 days old is replaced by the server's now, and the app corrects for a wrong phone clock using the catalog's server time. "Today" and weeks mean midnight in `America/Toronto` ([`SHOP_TIME_ZONE`](../../packages/validators/src/sales.ts)), as events do.
- **Payment methods** are a setting (`paymentMethods`, default all four). The app only records the method (PAY-1, `provider NONE`). No Square UI exists anywhere.
- **Customers at the sale (POS-6).** Optional. A new customer is created in the same batch, and one with the same email (any capitalisation) is reused. Marketing consent stores a date and a source (CUS-4).
- **Etsy (ETSY-1).** The sale response lists pieces that are also listed on Etsy. The POS shows a reminder before and after the sale, and the "ETSY" channel exists.

## Undo (POS-12)

`voidSale` puts every line's stock back and marks the sale `VOIDED` (with who, when and why) and its payment `REFUNDED`, in one batch. A piece that sold out returns to `AVAILABLE`, or to `AT_EVENT` when it is still assigned to the event the sale was made at. The stock restore is guarded on the sale still being `COMPLETED` **before** the sale row changes, so two simultaneous undos can't restore stock twice (tested). Staff can undo only their own sales from today. A card payment that is undone needs refunding in the owner's own card reader app, and the screens say so.

## Reporting (SALE-3, SALE-4, SALE-6, POS-14)

- **Admin** Sales list with filters (date, channel, event, method, status, sale number), a detail page (undo, email a receipt) and a CSV export. **Customers** list and search, detail with purchase history, edit, CSV export, and anonymise on request (CUS-5): personal fields are erased, the sales stay.
- **CSV safety.** Every typed value in an export is defused against spreadsheet formulas (`csvCell`).
- **Dashboard** (admin only): sales today, this week, this month and this year, with the month by channel and by event.
- **Small-supplier tracker.** The last 12 months of completed sales against `smallSupplierThresholdCents` (default $30,000), with an amber warning from 80% and a red one from 100%. It says plainly that it is an early warning and not tax advice, because the CRA test uses four consecutive calendar quarters.
- **End of day.** `sales.today` gives the count, total, items and a split by payment method, for the signed-in person (staff) or everyone (admin).
- Staff see no sales list, no revenue and no customer spending. Their customer search returns only name, email and phone (tested).

## The app (`apps/pos`)

Expo SDK 58 / React Native, **Android only**, runs in **Expo Go for development** because it uses no custom native code (the camera, secure storage and storage modules are all part of Expo).

- **Logic outside the screens.** `src/lib` holds the pure rules (reading a scan, finding pieces, cart, queue and sync, receipt text) and `src/state/store.ts` the `PosStore`, which owns the session, catalog, cart and queue. Neither imports React Native, so 59 tests run them in Node against a fake server. The screens are thin.
- **Offline (POS-10, R6).**
  1. A sale is **written to the phone first**, then sent. It stays queued until the server confirms. With no connection, or a server that doesn't answer within 8 seconds, checkout shows "Sale saved on this phone" straight away.
  2. The phone's copy of the stock is reduced immediately, so the same piece can't be sold twice while offline. A fresh catalog is re-adjusted for sales still waiting.
  3. Sync runs in order, oldest first, and stops at the first failure that would hit every later sale: no signal, a server problem, or a signed-out session. It runs at start-up, when the app returns to the front, when the connection returns, after each sale and every 20 seconds.
  4. A **refused** sale (for example the piece was sold elsewhere) is **parked for review** and the rest carry on. The More tab lists it with the server's reason, and offers Try again or Discard. The customer has already paid, so it is never dropped silently. A sale refused straight away (online) is not kept: the person stays on the checkout with the cart and the reason.
  5. A lost reply is safe: the same key is sent again and the server answers with the first sale.
  6. A **signed-out** session keeps the queue. After the next sign-in it goes out. Signing out never clears waiting sales.
- **The speed target (POS-2).** Scan → the piece opens → **Sell now** → payment method → **Record sale**: three taps after the scan. Unique pieces skip the quantity stepper (POS-15). A reserved piece shows who it is for and the button reads "Sell anyway". Sold, draft, archived and awaiting-payment pieces show the reason in words and offer no sell button (POS-3).
- **Sign-in (POS-1).** The same email and password. The POS session lasts 24 hours (existing rule), held in the phone's secure storage.
- **Fallbacks (POS-8).** Typing a name, a number (`123` finds `FFA-000123`) or a title word, and a torch button on the scanner.
- **Access (POS-13).** Buttons are at least 56 dp, text is 18 sp or more, colours come from the brand tokens (all pairs are contrast-checked in `@ffa/ui`), and every state is in words, not only colour.
- **Receipts (POS-11).** Optional email (sent by the server through the existing provider, and a failure never undoes the sale) or the share sheet. Receipts show no tax lines unless tax was charged.
- **Distribution (POS-0).** `eas.json` has a `preview` profile (internal APK, pointing at staging) and a `production` profile (pointing at the production API address). The production address `https://api.forestfae.ca` is a **placeholder until Phase 8** sets up the production domain.

## Assumptions

1. The production API will live at `api.forestfae.ca` (to confirm in Phase 8).
2. A sale made at a market that isn't in the events list is still a `MARKET` sale with no event.
3. A piece's reserved-for **customer** can't be set anywhere in the admin yet (INV-9's note is), so the "Reserved for them" list on a customer is empty until that is added. The POS already shows the name when one is set.
4. A void restores the stock and marks the payment `REFUNDED`, but does not touch money held anywhere else.

## Not done (and why)

- **Admin "record a sale".** Sales are recorded in the POS app (including Etsy, Instagram and phone channels). A browser form would be a second path through the most careful code in the system.
- **Tapping a sale in the POS to see its lines.** The Today list shows the count, method and customer, which is enough to find the sale to undo.
- **Native Bluetooth printing in the app**, and a branded splash beyond the icon on a cream background.
- **Testing on real phones.** The app was exercised in a browser against a mock of the API (sell, offline queue, automatic sync, Today, More), and its logic by the tests. On 4 Nov the developer ran it on a real Android phone in Expo Go: the camera scan, a sale, undo, airplane-mode queuing and the receipt share sheet all work (after the fixes below). Still open: an EAS preview build.

## Fixes from the first phone test (4 Nov)

| What the developer saw | Cause | Fix |
|---|---|---|
| A red box of JSON naming `occurredAt` ("expected int, received number"), about half the time | The phone's clock offset from the server is measured at the midpoint of a request, which is a half millisecond about half the time. The server only accepts a whole number. | The offset and the sale time are rounded to whole milliseconds. A sale already saved with a fractional time is rounded when it is sent. A refused request whose message is a validation dump now says "The server couldn't accept this sale" instead of the raw text. |
| **Record sale** spun for a long time with no signal | The app waited for a request that could not work, up to the 12 second timeout (longer if a background sync held the line). | If the phone knows it has no connection (`expo-network`), the sale is saved and the "Sale saved on this phone" screen shows at once. With a weak signal, checkout stops waiting after 8 seconds and shows the same screen. The sale stays queued and sends itself. |
| "This piece was already sold" after an undo | After **Undo**, the stock refreshed in the background, so a scan straight afterwards could see the old stock. (Not reproduced: the server's stock was correct.) | Undo puts the piece back on the phone's stock immediately, then refreshes. Catalog downloads are numbered, so an older answer arriving late can't overwrite a newer one. |
| A yellow "Product: This piece was already sold" banner while a sale was sending | The phone takes a sold piece off its own stock before sending (so it can't be sold twice offline), and the Check out screen re-read that stock while the request was in flight. | The Check out screen keeps showing the cart as it was when the button was tapped until the sale settles. A real refusal from the server still shows its message. |

The first three rows have tests in `store.test.ts` (the clock rounding, the stuck and the offline server, and the undo). The last row is a screen-only change with no screen test, because the app's tests cover logic, not screens; it was checked by hand on the phone.

## Consequences

- Migration `0006` adds `discount_reason`, `voided_at`, `voided_by_user_id` and `void_reason` to `sale`.
- New settings: `paymentMethods`. New API routers: `sales`, `customers` and `pos`.
- The POS app depends on `@ffa/api-types` for end-to-end types, so its type check includes the API's source (it needs the Workers and Node types, set in its `tsconfig.json`).
