# Logo directions for approval

Three original directions for Forest Fae Folk Art. Everything here is drawn from scratch as code (no stock art, no tracing). All text is converted to outlines, so the SVGs look the same anywhere with no fonts installed.

**Start with [comparison.png](./comparison.png)**: each direction in colour and in one-colour (mono), plus its square icon at 220, 96, 48 and 24 px.

| | A. Naturalist Banner | B. Specimen Seal | C. Minimal Mark |
|---|---|---|---|
| Idea | The printed banner, evolved: sage ground, engraved stag beetle and luna moth, flared small-caps name in copper and gold foil with a cream outline, pointed corner ornaments | A round naturalist's stamp: luna moth in the centre, name set around the ring, fern sprigs, double rules | A geometric moth built from four leaf shapes, with a refined small-caps wordmark |
| Files | `A-naturalist-banner-*` | `B-specimen-seal-*` | `C-minimal-mark-*` |
| Type | Marcellus (flared serif capitals) | Marcellus | Cormorant SC SemiBold |
| Best for | Website hero, banners, signage, social covers | Stamps, packaging seals, avatars, label corners | Favicon, app icon, thermal labels, small sizes |
| Weak spot | Fine hatching disappears below about 64 px, and the mono version needs a large size to keep detail | Hairline rings and the fine engraving drop out on a 203 dpi thermal label, and the ring text becomes unreadable under about 100 px | Least "folk-art whimsy" on its own. It is clean and modern rather than vintage |
| Small-size test | Icon is a recognisable beetle down to 48 px, a blob at 24 px | Icon holds at 48 px, soft at 24 px | Holds at every size, including 24 px |
| Thermal label (1-bit) | Not suitable | Not suitable at 40x30 mm | Suitable as is |

## Decision

**Approved on 31 Oct 2026 by the developer (as the owner's proxy): use A as the main brand and the geometric moth from C as the small mark.** B stays in the kit as an optional packaging stamp. See [ADR 005](../../../../docs/adr/005-brand-direction.md) for the decision, the contrast measurements and what is still to build.

## Recommendation (as proposed)

Use **A as the main brand** for the website and anything large, because it is the direction that evolves the owner's current banner, which was the brief. Pair it with the **geometric moth from C as the small mark** for the favicon, the Android app icon and the label logo, because it is the only mark that stays clear at 24 px and on a one-colour thermal print. B stays available as the stamp for packaging if you like it.

If you want just one direction, pick C for flexibility, or A for character.

Note: I have not seen the owner's banner, only your written description of it (soft sage ground, deep-brown ink, copper and gold foil lettering with a cream outline, engraved insects, sharp corner ornaments, a flared calligraphic small-caps name). A matches that description. It does not copy the banner's own lettering or art.

## What I need from you

1. Which direction (or combination) do you approve, and what would you change?
2. Is the beetle and moth pair right for the hero, or would you like other insects from the kit (butterfly, dragonfly, cicada, spider, centipede are planned)?
3. Should the final lettering stay in Marcellus, or do you want something closer to the banner's calligraphic caps? Fonts here are open-licence (SIL OFL), so any change is easy.

Once approved I will build the rest of the SVG kit in the chosen style, wire the mark into the label engine (it currently uses a placeholder moth), and set the colours and type as design tokens.

## Files

For each direction: `lockup` (full logo) and `icon` (square), each in `colour` and `mono`, as SVG. The lockups also have a PNG preview.

## Palette used

Sage `#B7C3A3`, forest `#2F4A3A`, deep brown ink `#2B1E16`, parchment `#EFE6CF`, cream `#F4EFE3`, gold `#D9B15A`, copper `#B4733A`, deep copper `#86522A`. Contrast against WCAG AA is checked when the design tokens are built.

## Regenerate

```sh
pnpm --filter @ffa/ui brand:directions
```

The drawing code is in `packages/ui/scripts/brand/` (`art.ts` for the insects, corner ornaments and ferns, `directions.ts` for the three layouts, `lettering.ts` for text outlines).

## Font licences

Marcellus, IM Fell English SC and Cormorant SC are under the SIL Open Font License. The licence texts are in `packages/ui/fonts/`. IM Fell English SC is downloaded but not used in these three directions.
