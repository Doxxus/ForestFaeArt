# ADR 005: Brand direction

Status: **accepted** by the developer (acting as the owner's proxy before handover) on 31 Oct 2026.

## Decision

- **Main brand: Direction A, "Naturalist Banner".** It evolves the owner's printed banner: sage ground, engraved insects, a flared small-caps name in copper and gold foil with a cream outline, and pointed corner ornaments. Used for the website hero, banners, signage and social covers.
- **Small mark: the geometric moth from Direction C.** Used for the favicon, the Android app icon, the POS app, and the logo in the centre of the QR code on labels. It is the only mark that stays clear at 24 px and prints well in one colour.
- **Direction B, "Specimen Seal", is kept in the kit** as an optional stamp for packaging and avatars, but is not used by the product.
- Lettering stays in **Marcellus** (flared serif capitals, SIL OFL) for the wordmark and headings, and **Cormorant SC** for the compact lockup. The owner can change this after handover.
- Brand colours and type live in `packages/ui/src/tokens.ts`. Text and background pairs are checked against WCAG 2.1 AA in `tokens.test.ts`, so a failing pair breaks the build.

## Contrast (measured)

| Pair | Ratio | Use |
|---|---|---|
| ink on cream | 14.08 | body text |
| forest on cream | 8.47 | headings, links |
| moss on cream | 5.15 | secondary text |
| copperDeep on cream | 5.62 | accent text at normal size |
| cream on forest | 8.47 | primary buttons |
| champagne on forest | 6.93 | dark sections |
| ink on sage | 8.73 | the banner ground |
| copper on cream | 3.36 | **large display text and graphics only** |
| gold on forest | 4.81 | **large display text and graphics only** |

Copper and gold must not be used for normal-size text. Use `copperDeep` instead.

## Done now

- The label engine's placeholder logo is replaced by the geometric moth (`packages/label-engine/src/logo.ts`). All QR scan tests still pass with it.
- Design tokens and contrast checks exist in `packages/ui`.

## Phase 4 progress (started 3 Nov)

Done (see [ADR 011](./011-public-site.md)): the SVG kit in this style (butterflies, moths, beetles, dragonfly, cicada, spider, centipede, mushrooms, ferns, leaves, a branch, wildflowers, dividers and the corner ornament), the favicon, touch icon and link-preview picture, the style-guide page, and the Tailwind theme wiring from the tokens.

Still to do:

- Loaders (a small animated mark) when a page needs one.
- A one-colour version of the compact lockup for the thermal label header, if wanted.
- Android app icon (with the POS app, Phase 6).
- The owner may want to review the lettering and insects after handover.

## Caveat

The insects are generated from code in an engraving style. They are original, but they are an illustrator-style approximation. If the owner or an artist wants hand-drawn art later, the kit's file layout and the tokens do not need to change.
