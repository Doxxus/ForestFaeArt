# QR label print test (spike 3)

Goal: prove a QR code with a logo in its centre scans reliably when printed at 40x30 mm on the NIIMBOT B1, before the label designer is built around it.

## Make the test labels

```sh
pnpm --filter @ffa/label-engine test-sheet
```

This writes seven labels to `packages/label-engine/out/test-sheet/` (not committed). Each `*.png` is 320x240 px, which is 40x30 mm at 203 dpi, pure black and white. `contact-sheet.png` shows them all, `INDEX.md` lists what each one tests, and `*-preview-4x.png` are enlarged previews for looking at on screen.

| Label | Tests |
|---|---|
| A | URL as specified (`https://forestfae.ca/p/FFA-000123`), logo about 11% of the QR |
| B | Same URL, no logo (baseline) |
| C | Same URL, smaller logo (about 8%) |
| D | Upper-case URL, which makes a smaller QR with bigger dots (0.75 mm instead of 0.63 mm), logo about 10% |
| E | Upper-case URL, no logo (baseline) |
| F | Upper-case URL, larger logo (about 14%) |
| G | Very long title (text fitting) |

Every label has a black **TEST** bar so it can never be mistaken for a real label (LBL-13).

## Print them (NIIMBOT app)

The app screens may differ slightly from these steps. The key rule is that the image must print at 100%, not stretched or shrunk.

1. Copy the seven `A-...png` to `G-...png` files to your Android phone (cable or cloud drive). Use the files without `-preview-4x` in the name.
2. Load a 40x30 mm roll in the B1 and connect it in the NIIMBOT app.
3. Make a new label, set the size to 40 x 30 mm (or let the app detect the roll), add an image, and pick the PNG.
4. Stretch the image to fill the whole label exactly. Do not leave a border, rotate, or let the app "fit" or smooth it.
5. Print at the highest density the app offers, then once more at a lower density.
6. Print each label twice so you can compare.

## Scan them

Test each printed label with **two phones** (yours and the staff phone if you can):

1. Normal distance (about 15 cm) in good light.
2. At about 30 degrees from the side.
3. In dim light.
4. From arm's length (about 40 cm).
5. After rubbing the label once with a finger (thermal prints can smudge).

A scan passes if the phone offers to open `forestfae.ca/p/FFA-000123` (the page does not exist yet, so it will not load, which is fine). Upper-case labels (D, E, F) will show `HTTPS://FORESTFAE.CA/P/FFA-000123`. That is expected, and the website route must treat the path case-insensitively.

## Report back

For each label, tell me: scanned first time, scanned after a few tries, or failed, and on which phone and which test. Also tell me if the print looks too bold (dots merging), too faint (broken dots), or cropped at the edges. Those results decide:

- whether the logo stays at about 12% (or goes smaller),
- whether we switch the QR to the upper-case URL by default,
- the default print density to recommend in the Owner Guide.

## What is already verified on the computer

Every variant is rendered and decoded back to the exact URL in automated tests, with the print simulated as exact, one dot bolder (ink spread), and one dot thinner (ink loss). All variants pass at exact size and with ink spread. With ink loss, only the upper-case variants pass, because their dots are bigger. This used a basic decoder (jsQR), and phone cameras are stronger, so treat it as a worst case, not a prediction. The physical test above is what counts.
