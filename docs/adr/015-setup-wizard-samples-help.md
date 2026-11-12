# ADR 015: Setup Wizard, sample data, in-app help and the accessibility pass (Phase 7)

Status: **accepted** (12 Nov 2026, Phase 7, started early). Built, tested and deployed to staging. Not yet clicked through by the developer on staging with real data.

## Decisions agreed with the developer (12 Nov 2026)

| Question | Decision |
|---|---|
| How "Remove sample data" works while products and the ledger can't be deleted | **A narrow exception in the database** ([migration 0007](../../packages/db/migrations/0007_sample_data_removal.sql)): rows that belong to a sample piece can be deleted, nothing else can. A sample piece that ended up in a sale with a real piece is kept and reported. |
| The wizard's shape | **A guided page at `/admin/setup` (7 steps), plus a "Finish setting up" card on the dashboard** until it is done or dismissed. Administrator only. |
| Sample pieces on the public site | **A Settings switch, off by default** (SAMP-3). |
| Owner help | **In-app now**: a "?" drawer on every admin page and hints on the tricky fields. The Phase 8 Owner Guide reuses the same words. |

## Sample data (SAMP-1 to SAMP-4)

- **What loads.** The four pieces SAMP-1 names, one in each status: Blue Morpho Shadowbox (Available), Atlas Moth Display (Reserved), Rainbow Scarab Collection (At an event) and Luna Moth Necklace (Sold), each with categories, details and a picture. Three events: Spring Craft Fair, Woodland Arts Festival and Holiday Market, dated from the day they are loaded so they are always in the future. The At-an-event piece is linked to the first event.
- **Tagging.** Rows carry `is_sample` (the column already existed on products and events). They show a **Sample** badge on the product and event lists and pages, and a notice on their pages. The dashboard says when samples are loaded, because the counts include them.
- **Hidden by default (SAMP-3).** `toPublicProduct` returns nothing for a sample piece unless the new `showSampleData` setting is on, which covers the portfolio, the product page and the home page lists. The public event list and event page do the same. Every public product query already goes through `toPublicProduct`, so there is one place to change.
- **Pictures (SAMP-4).** Four original drawings from the SVG kit (morpho, atlas moth, scarab, luna moth) on a dashed "sample card" that says **SAMPLE PICTURE**. `pnpm --filter @ffa/ui kit` writes them into `apps/api/src/media/sample-art.generated.ts`, and the media route serves `samples/<name>__<id>.svg` straight from that module (no R2, no hotlinking). Each is about 6 KB, sent as `image/svg+xml` with `nosniff` and a `sandbox` Content-Security-Policy so a drawing opened on its own can run nothing. A test fails if the committed file is stale, like the kit's.
- **Few queries.** Cloudflare's free plan allows 50 database queries per request, so loading and removing use a handful of reads and **one batch**. SKUs are taken in one query (`allocateSkus`), and the per-piece inserts live in `inventory.ts` (`sampleProductStatements`), which stays the only writer of `product.quantity` and `product.status`.

### Removal

`removeSampleData` removes every sample piece and event, and anything that hangs off them, in one batch:

1. **Practice sales go too.** A sale made only with sample pieces is a test (for example the handover test sale and undo, HAND-4). It is removed with its payment, lines and ledger rows. This is a refinement of what was agreed ("a sample piece that ended up in a real sale is kept"): without it, a handover test sale would pin a sample piece for good.
2. **A real sale keeps its sample piece.** A sample piece in a sale that also holds a real piece stays, and the result names the sale number. A sample event stays if a real piece was taken to it or a real sale was made there.
3. **Uploaded photos** on a sample piece are deleted from storage too (the drawings need nothing).
4. **Things that pointed at a sample piece** are cleaned up: inquiries about it lose the link, and label prints, categories, details and web-address redirects are deleted.
5. **Loading again afterwards works.** Picture keys are unique per piece, and SKU numbers are never reused.

The audit log records both the load and the removal (it stays append-only).

### The database exception

Migration `0007` replaces two triggers from `0002`:

- `product_no_delete` now aborts only when `OLD.is_sample = 0`.
- `inventory_transaction_no_delete` now aborts unless the row's product is a sample.

Everything else is unchanged: the ledger can never be **updated**, the audit log is still append-only, and a real piece or its ledger rows still can't be deleted (tests prove all four). The app has no way to turn `is_sample` on for an existing piece: only the loader sets it.

## The Setup Wizard (SET-1 to SET-8)

- **Seven steps**, in order: business details, story and links, how the shop works, categories, first piece, labels and QR codes, first event. **Only step 1 can't be skipped** (it needs a business name). Progress is saved in a `setupProgress` setting, so it can be left and resumed; a step is never both "done" and "skipped".
- **Where it shows.** A card on the dashboard until the wizard is finished or "Not now" is pressed; always available from Settings ("Carry on" or "Start the wizard again", which only walks through the steps and changes nothing already saved). The developer pre-completes it before handover (SET-1); finishing it sets `finishedAt`.
- **What each step does.** Steps 1 to 3 edit settings (adding a **phone number** setting, shown on the contact page when filled in). Step 4 lists the categories and adds one. Step 5 links to adding a piece or importing, and offers the sample data. Step 6 is the QR demonstration (SET-7): it picks a real piece, or a sample one if there is none, and walks through opening it, printing its label, scanning it with the phone, selling it in the POS app and undoing it. Step 7 links to adding an event.
- **Administrator only.** Staff don't see it (it changes settings).
- **Why a guided page rather than a full-screen takeover.** The owner arrives after the developer has done the setup, so the wizard should never block the app. It is offered, not forced.

## In-app help (ADM-1)

- A **Help** button in every admin page's header opens a drawer (a native `<dialog>`, so focus is trapped, Esc and the backdrop close it, and focus returns to the button). It shows help for the page you are on: what the page is for, what to do, and good-to-know notes. A test makes sure **every admin page has its own help** (it reads `app/admin/**/page.tsx`), that no two share a title, and that the words are everyday ones (no "SKU", "API", "database" and so on; nothing about Square or Etsy sync, as the requirements ask).
- The text lives in [`apps/web/lib/help.ts`](../../apps/web/lib/help.ts) as plain data, so the Owner Guide (HAND-5, Phase 8) can reuse it.
- **Inline hints** were added where a first-timer is most likely to stumble: the product title, the event start and end, and what each status means.

## Accessibility and performance pass (admin and sale flow)

Method: axe-core (WCAG 2.1 A and AA plus best practice) on **33 admin pages at desktop width and 19 at 375 px**, with the help drawer open, plus keyboard checks and a layout check for sideways scrolling and tap-target sizes, on a local copy of the stack.

| Found | Fix |
|---|---|
| A button whose accessible name didn't contain its visible words ("Take off") on the event page, and the same on the photo "Move earlier / later" buttons (WCAG 2.5.3) | The names now start with the visible words |
| An empty table header in the import history | A visually hidden "Undo" |
| A table that scrolls sideways on a phone had no way to be scrolled by keyboard | Tables are now a labelled, focusable region (`Table` takes a `label`) |
| **Sideways page scrolling on a phone** on the sale, customer, piece and event pages | Grid columns now start as one column (`grid-cols-1`) and cards can shrink (`min-w-0`), so a wide table scrolls inside its box, not the page |
| Small tap targets (dashboard links, the header name, some "details" toggles) | Raised to 40 px or more |
| Escape didn't close the help drawer in the embedded test browser (a plain `<dialog>` didn't either) | An explicit Escape handler, harmless where the browser already does it |

After the fixes, axe reports **no violations** on any page checked, nothing scrolls sideways at 375 px, and every button is at least 24 px tall (most are 44 px). Checkboxes and radio buttons are 20 px but sit inside labels that are 44 px tall, and the few inline text links in table rows rely on WCAG 2.2's spacing exception. **Performance:** the admin is server-rendered. Its client JavaScript is the framework plus small per-page chunks (the largest page chunk is 15 kB, about 5 kB gzipped), and the help drawer adds a few kilobytes of text. Lighthouse needs the deployed site behind the real domain, so it stays with Phase 8. The public site is excluded here and is checked at the end of Phase 9.

Not covered: a screen-reader run (VoiceOver or TalkBack) and a real-phone pass of the wizard, which the developer should do on staging.

## Assumptions

1. **The wizard doesn't change settings behind the owner's back.** Step 1 saves the four values typed on it and nothing else.
2. **"Website address" in step 1 is the label web address** (`qrBaseUrl`), because that is the website address the system actually uses and printed QR codes depend on it.
3. **A practice sale is one with only sample pieces** (see Removal). If one of those was a real sale, which the app has no way to arrange, it would be removed.
4. **Sample pieces appear in the POS app** so the handover test sale (HAND-4) can use one. They aren't marked there. Removing the sample data takes them out of the next catalog download.
5. **Dashboard stock value and the status counts include sample pieces** while they are loaded. The dashboard says so.
6. **A kept sample piece blocks loading the samples again** until it is dealt with, because "samples are loaded" means any sample row exists. It is an edge case (a sale with a real piece).
7. **The Morpho drawing is the kit's green-brown one**, not blue, because the kit's palette is the brand palette. It is a sample picture, and it says so.

## Not done (and why)

- **A "Sample" mark in the POS app.** It would mean a catalog change for a state that exists only until handover.
- **A full-screen first-run takeover.** See above.
- **A run with a screen reader** (needs a device). Lighthouse (needs the production domain, Phase 8).
- **Video walkthroughs** (HAND-5): written help comes first, and the Owner Guide is Phase 8.

## Consequences

- Migration `0007` changes two triggers (no table changes). New settings: `businessPhone` (public), `showSampleData` and `setupProgress` (private). A new `setup` router (administrator only) with `get`, `markStep`, `finish`, `dismiss`, `restart`, `loadSamples` and `removeSamples`.
- `toPublicProduct` now takes the `showSampleData` setting. Anything new that shows pieces to the public must keep going through it.
- `pnpm --filter @ffa/ui kit` now also writes `apps/api/src/media/sample-art.generated.ts`. Commit it with the kit files.
- New tests: 51 across the wizard, the samples (loading, public hiding, removal edge cases, pictures), the trigger exception, the shared rules and the help.
