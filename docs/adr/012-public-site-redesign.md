# ADR 012: Public site redesign (Phase 9)

Status: **proposed** (4 Nov 2026). Direction agreed with the developer on 4 Nov; nothing is built yet. The build window is **8 to 14 Dec 2026** (Phase 9), ending at the feature freeze. Phase 5 starts first.

## Why

The Phase 4 public site ([ADR 011](./011-public-site.md)) works well, but it reads as a clean, conventional portfolio. The developer wants it to feel **calm, peaceful and whimsical**, and less like a stock website, while staying fast on a phone. The admin look is approved and does not change.

## Scope

**In scope (presentation only):** colours, backgrounds, scroll animation and art for the public site under `app/(site)`.

**Out of scope:** the admin (`/admin`), the API, the data model, routes, URLs, the "Coming soon" gate, the `/p/<sku>` QR route, SEO and search rules, and every public-data rule ([ADR 011](./011-public-site.md)). If the redesign needs an API change, that is a sign the scope has crept.

## Direction (decided 4 Nov)

| Topic | Decision |
|---|---|
| Palette | A **fully green world**: meadow, forest and spring greens. The page background shifts green by section as you scroll (sky and canopy, to meadow, to forest floor). Copper stays only for small details (rules, prices, buttons' hover). Admin tokens are untouched |
| Reading areas | Cards and text panels stay **cream, with a little transparency and a soft blur** so the world shows faintly behind them. Text sits on a solid-enough cream to keep contrast (see "Accessibility") |
| Scene | **Layered woodland**: far hills and trees, mid trunks and ferns, near grass, each layer drifting at its own speed behind the content (parallax) |
| Scroll effects | **Mushrooms grow out of the ground** as you scroll. **Leaves drift past** as you scroll. **The occasional insect** (butterfly, moth, dragonfly and so on) crosses the scene |
| Where | The **home page gets the full scene**. Inner pages (portfolio, product, events, About, Contact, legal) get a **calmer, lighter version** (fewer layers, less movement) so the work stays the focus |
| Mobile | **CSS-only where supported, a static fallback elsewhere, and fewer elements on small screens** |
| Reduced motion | People who set "reduce motion" see a **still version of the same scene**, with no movement at all |
| Mood | Calm, peaceful, whimsical. Occasional insects in the scenes |

## Assumptions (to confirm when the build starts)

1. **Public tokens only.** The new greens are added as site-scoped tokens (for example a `.site-world` wrapper in `app/(site)/layout.tsx`), not by editing the shared theme the admin uses. That keeps the admin pixel-identical.
2. **Scroll-driven CSS first.** Parallax and growth use `animation-timeline: scroll()` or `view()` (already used for the hero in Phase 4, guarded by `@supports`), transforms and opacity only, so the work stays on the compositor and costs no JavaScript. Browsers without support get the **still scene** (the same one reduced-motion users get), so there is one fallback to build and test, not two.
3. **Scenery is drawn by the same generator as the kit** (`packages/ui/scripts/kit`): hills, tree lines, trunks, grass, mushrooms in growth stages, several leaf shapes and a few more insects. Layers are plain SVG files, optimised with SVGO, with a size budget enforced by a test like the existing one. Nothing is a raster image.
4. **Mushrooms grow with a scale and rise** animation tied to each one's position in view (`view()` timeline), not a frame-by-frame sequence.
5. **Leaves and insects are a small fixed pool** (a few elements, reused), not one element per leaf per section.
6. **Backgrounds are fixed or sticky behind the content**, so long pages do not repeat or tile and do not grow with the page height.
7. **A "calm" level is one switch**, a data attribute or class on the wrapper (`full` on home, `calm` on inner pages), so each page picks a level and the CSS decides what to show.
8. **No new dependencies.** No animation library and no canvas or WebGL. If something cannot be done in CSS, a very small client script is allowed only after the budget below is checked, and it must switch itself off for reduced motion.

## Mobile performance budget

These are the exit gate for Phase 9 and should be measured, not assumed.

| Measure | Target |
|---|---|
| Lighthouse mobile performance (home, throttled) | 90 or more, and no lower than today's score minus 5 |
| Largest Contentful Paint (home, 4G) | 2.5 s or less (UX-6) |
| Cumulative Layout Shift | 0.05 or less. Every art element has reserved size (the kit manifest already does this) |
| Extra art weight on first load (home, phone) | About 60 KB or less of SVG above the fold, the rest lazy-loaded |
| Layers animated at once on a phone | 3 or fewer scrolling layers plus 2 or fewer drifting elements |
| JavaScript added | 0 KB target |
| Main-thread jank while scrolling a mid-range Android phone | No visible stutter, checked on the developer's real phone |

Techniques: `transform` and `opacity` only, `will-change` sparingly, `content-visibility: auto` on off-screen sections, smaller or fewer elements below 640px, `@media (prefers-reduced-motion: reduce)` and `@supports not (animation-timeline: scroll())` both fall back to the still scene.

## Accessibility

- All scenery is decorative: `aria-hidden`, `alt=""`, never receives focus, and never carries information.
- Text contrast of 4.5:1 or better on every text panel, **measured against the worst-case background behind the translucent panel** (axe cannot do this on gradients and blur, so check by hand and keep panels opaque enough). Transparency is capped so that this always holds.
- Large decorative text (the foil title) keeps the contrast approach from Phase 4.
- Reduced motion gives a fully still scene (this is a requirement, not a nicety). Motion is never needed to understand a page, and nothing flashes.
- Keyboard, focus rings, the skip link and the gallery dialog do not change. Re-run the axe checks on every public page.

## Plan and order of work (value first, so Phase 9 can stop at any point and still look finished)

1. **Palette and backgrounds:** green tokens for the site, section background shifts, frosted cream panels, contrast check.
2. **Layered scene on the home page:** far, mid and near layers with parallax, and the still fallback.
3. **Calm scene for inner pages.**
4. **Scroll-grown mushrooms.**
5. **Drifting leaves and the occasional insect.**
6. **Polish and gate:** reduced-motion and unsupported-browser checks, Lighthouse mobile, a real-phone scroll test, axe, update the style guide with the new scenery, update this ADR.

## Alternatives considered

| Option | Why not |
|---|---|
| A JavaScript parallax or animation library | Adds weight and main-thread work on phones. CSS scroll timelines do the same job for free where supported |
| Canvas or WebGL scene | Heavy on battery, hard to make accessible, hard to give a still fallback |
| Raster (PNG or WebP) layers | Larger files and blurry on high-density screens. The kit is vector already |
| Redesign the admin too | The developer approved the admin look |
| Run the redesign after handover | Rejected: the owner's first look at the public site should be the redesigned one |

## Risks and open items

- **Schedule (R9, [phase0-kickoff.md](../phase0-kickoff.md)):** this is the last feature work before the freeze. The order of work above is the descoping order (drop from the bottom).
- **Art effort:** layered scenery is more drawing than the first kit. The generator should make it cheap, but the look will need a few review rounds. **Plan one review of the home scene mid-phase**, not only at the end.
- **Browser support:** scroll-driven CSS animation is not in every older browser. The still scene is the intended experience there, not a bug.
- **Brightness and legibility:** green on green is easy to get muddy. Keep the reading panels and headings clearly separated from the scenery.
- **Open question for the build:** exact greens (to be shown as swatches against the cream panels for approval before they are applied everywhere).
- **Open question for the build:** whether the footer's dark forest band stays or becomes part of the forest-floor scene.
