# ADR 013: Label printing (Phase 5)

Status: **accepted** (4 Nov 2026, Phase 5). Built, tested and deployed to staging. **Spike 4 passed on 4 Nov: direct Bluetooth printing to the real B1 from Chrome on Android works, and a printed test label scanned and opened the right product page.** See "Spike 4". Builds on [ADR 004](./004-label-rendering.md) (the label engine and the print test).

## Decisions

### Where labels are drawn: in the browser

The label engine already makes a portable SVG (QR, logo and text as paths). The browser draws it, so:

- **The session token never leaves the server.** Pages load the pieces through the API on the server and pass plain data to a client component. The browser draws labels, makes the files, and calls one server action to record the print.
- **One drawing for every output.** The same SVG is previewed, turned into a pure black and white PNG, embedded in PDFs and sent to the B1. What the owner sees is what prints.
- **The engine is loaded on demand** (dynamic import), so pages that do not print carry none of its code (QR, fonts, PDF writer) and the web Worker does not bundle it.
- **Not stored in R2.** LBL-6 asked for generated files to be kept in R2. Labels are drawn on demand from the piece's current data, so a stored file could only go stale, and a title or price change cannot leave an old file behind. The print record (below) is what is kept.

### Templates (LBL-2)

- Stored in the existing `label_template` table. Width, height and orientation are columns, the rest (margin, which of QR/SKU/title/price show, alignment, text size, logo share, upper-case URL) is JSON in `fields` and `margins_mm`. Orientation is derived from the size.
- **The shipped presets** (40 x 30 default, 40 x 70, 50 x 30, and a 30 x 15 jewelry tag with QR only) are added the first time templates are listed, from one list in `@ffa/validators`. A deleted preset never comes back. Templates are archived, not deleted, because past print records point at them. The default cannot be archived, and there is always exactly one (a unique index plus a one-batch swap).
- **Layouts**: *side* (QR left, title and price right, the proven layout), *stack* (tall labels: QR on top, text below), *QR only*, and *text only*. The layout is chosen from the size and the fields. The default 40 x 30 output is **byte-for-byte the layout proven on the B1**: tests pin its fingerprint for five inputs, so a later change cannot alter it unnoticed.
- **Scan warnings (LBL-8).** QR dots of 4 dots (0.5 mm) or more are "ok", 3 is "small, test it", below 3 is "too small". The editor and print screen show plain-language warnings. A 30 x 15 jewelry label is "small" even with the upper-case URL, which is physics, not a bug, so it warns.
- Limits: 10 to 200 mm, margins up to 10 mm, text size 0.6 to 1.6. The B1 takes labels up to 50 mm wide.

### Printing (LBL-1, LBL-3, LBL-4, LBL-10)

- **Sources:** pieces ticked in the product list, a category, an event's pieces, all with no label, all with an out-of-date label. A copies count per piece (1 to 99) and up to 200 pieces and 500 labels per print.
- **Outputs:** *B1 over Bluetooth*, *PNG pictures* (one per label, a ZIP for several, or the phone's share sheet), *PDF* (one label-sized page per label), *A4 sheet*.
- **A4 sheets** are planned by a pure function (`planSheet`): margin, gap, crop marks or a box round each label, a start position for partly used sticker sheets, and copies, over as many pages as it takes. 40 x 30 with 5 mm margins is 5 x 9 = 45 labels, as the requirements say. The screen shows the first page drawn to scale and a "print at 100%" reminder.
- **PDFs hold 3x pictures** (609 dpi, pure black and white) at exact size, one stored copy per distinct label however many copies are printed. This was chosen over translating the SVG to PDF drawing commands: the picture is by construction what was previewed, and it prints crisply. The cost is that the QR is not infinitely sharp. At 609 dpi on a laser printer that is invisible, and a test decodes the QR from the 3x picture.
- **Printer-agnostic (LBL-5):** `LabelRenderer` and `LabelPrinter` interfaces in the engine. PNG, PDF and A4 are outputs of the print screen, and the B1 is its own adapter (`apps/web/lib/niimbot.ts`). Another printer is a new adapter.

### Print records, out-of-date labels and test labels (LBL-4, LBL-12, LBL-13)

- Every print writes one `label_print` row per piece: the **title and price that were drawn**, the template, the output, the copies, the QR address and whether it was a test. The browser reports what it drew and the server records exactly that, so a piece edited while someone was printing is correctly flagged. The server decides whether it is a test.
- **A label is out of date** when the newest print of the current kind has a different title or price than the piece has now. Changing anything not on the label (description, featured, photos) does not flag it. Pieces are flagged in the product list (with a "Label out of date" filter), on the piece's page, and on the dashboard, and "all with an out-of-date label" is one click to reprint.
- **Test versus real.** A label is a test unless the environment is production **and** *Label web address* is the real domain. While labels are being made as tests, only test prints count toward "has a label", and in production only real prints do. So a batch printed on staging never makes a real piece look labelled, and a stale real label is still flagged even when a newer test print exists.
- The print is recorded when the file is made or sent, because the browser cannot know a paper label was physically printed. A reprint is one click and adds to the history.

### Spike 4: B1 over Bluetooth

- **Route chosen:** `@mmote/niimbluelib` (MIT, unofficial, B1 is a listed model) over **Web Bluetooth in Chrome on Android**, loaded on demand. This needs no native build, no new app and works from the admin on the phone, which is where the owner and the staff already are. The B1's head is 384 dots, so 50 mm labels are trimmed to the middle 48 mm (only blank margin, or the label is refused).
- **Built:** a staff-only test page (`/admin/labels/printer-test`) with connect, a test card, direction and darkness, and a connection log, and the *Print on the B1* option on the print screen (one job per label, with copies).
- **Status: passed on the real B1 (4 Nov 2026).** Printing from Chrome on the developer's Android phone works, and a label printed this way scanned and opened the correct product page. LBL-9 direct printing is therefore done for the admin on Android. PNG through the NIIMBOT app stays as the fallback for browsers without Web Bluetooth (iPhone, Firefox, desktop Safari). The steps used are in [staging.md](../staging.md#labels-and-the-b1-printer). Not yet checked on hardware: a 50 x 30 label (the 384-dot trim) and a multi-label batch with copies.
- **What it means for the POS app (Phase 6):** Expo cannot use Web Bluetooth. The same protocol library can run over an Expo BLE module, but that needs a native dev build. Options for Phase 6, to decide at its start: (a) the POS app prints labels by opening the admin print screen in Chrome (no native Bluetooth code), (b) the POS app does Bluetooth itself through a BLE module and the library's protocol code, or (c) the POS app does not print labels at all and labels stay an admin task. Labelling is mostly done at the desk before events, so (a) or (c) may be enough.

## Not built (and why)

| Item | Why |
|---|---|
| Label files stored in R2 (LBL-6) | See above: drawn on demand, nothing to go stale |
| B1 print from the POS app (LBL-9, P1) | Waits for the spike result and the Phase 6 native build |
| A4 sheet presets for named sticker products | Margin, gap and start position cover them. Add if the owner names one |
| A queue that survives a lost Bluetooth connection | A failed print can be sent again. Revisit if it proves annoying |

## Tests

Engine: layouts, fingerprints of the proven default, scan decoding on every layout with ink spread, sheet geometry and PDF output (91 tests). API: templates, selection, records, out-of-date and test-versus-real rules (23 tests). Validators and the ZIP writer have their own tests. In the browser the whole flow was run on local: previews, PNG ZIP, PDF and A4 files were captured and checked (exact pixel size, pure black and white, QR decodes, PDF page sizes), and axe found no accessibility problems.
