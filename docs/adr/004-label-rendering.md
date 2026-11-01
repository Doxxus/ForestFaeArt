# ADR 004: Label rendering

Status: **accepted**. Print test passed on the real B1 on 31 Oct 2026 (see Outcome).

Date: 31 Oct 2026.

## Decision

- `packages/label-engine` builds each label as one **SVG made only of paths and rectangles**. QR dots are merged rectangles on an integer pixel grid, and text and the logo are glyph outlines, so the SVG looks identical everywhere and needs no fonts installed at render time.
- Rasterising to a 1-bit PNG is per environment and lives in `@ffa/label-engine/node` (resvg, Node only). The portable entry point has no native dependencies, so the browser, Workers and the Android app can use it with their own rasteriser.
- Default layout at 40x30 mm and 203 dpi (320x240 px): QR on the left, the logo in its centre, the SKU under the QR, the title on the right, and the price directly under the title. The price is the largest text (48 px, about 6 mm, shrinking only if a long price needs it) so it reads from a distance. A black **TEST** bar is added when the base URL is not production.
- QR error correction is always **H**. The logo knock-out is an odd number of modules, centred, chosen to be closest to 12% of the QR area.
- Fonts: Barlow Condensed (SIL OFL, `fonts/OFL.txt`) as a placeholder. The brand type replaces it after the branding decision.
- The logo is the geometric moth from the approved brand direction (see [ADR 005](./005-brand-direction.md)), in `src/logo.ts`. It replaced the earlier placeholder moth on 31 Oct 2026, and every QR scan test still passes.

## Evidence so far

- `https://forestfae.ca/p/FFA-000123` produces a version 4 QR (33 modules, 5 px or 0.63 mm per dot). The upper-case form `HTTPS://FORESTFAE.CA/P/FFA-000123` uses the compact alphanumeric mode, giving version 3 (29 modules, 6 px or 0.75 mm per dot).
- All variants decode back to the exact URL after rendering at exact size and with one dot of ink spread. With one dot of ink loss, only the upper-case variants decode in the jsQR test decoder.
- Open question for the print test: default to the upper-case URL (bigger dots, but needs a case-insensitive `/p/` route and shows an upper-case address when scanned) or keep the spec's lower-case URL.
- Physical print (31 Oct 2026, NIIMBOT B1, PNGs imported through the NIIMBOT app): labels **A** (lower-case URL, logo about 11%), **B** (lower-case, no logo), **E** (upper-case, no logo) and **F** (upper-case, logo about 14%) all printed and scanned. C and D were not printed.

## Outcome

- **Default stays the lower-case URL as specified** (`https://forestfae.ca/p/<SKU>`) with the logo at about 12%. It was proven on the real printer, so there is no need for a case-insensitive route just for labels.
- The upper-case option (`uppercaseUrl`) stays in the engine as a proven fallback with bigger dots, and a 14% logo also scanned, so there is headroom if the brand mark needs more space.
- Still worth doing at handover: scan the first real batch with the owner's and staff phones (HAND-4).

## Problems found while building (kept as regression tests)

- `opentype.js` v2 `toPathData` emits `NaN` coordinates for some glyph sequences (for example "Bot" at 20 px), which silently drops letters. We serialise glyph commands ourselves and fail loudly on non-finite numbers.
- A word was split mid-word when a smaller font would fit it. Wrapping now shrinks the font first and only splits words at the smallest size.

## Not built yet (Phase 5)

Adjustable templates, A4 batch sheets with crop marks and start position, PDF export, stale-label flag, label print records, and direct Bluetooth printing (spike 4).
