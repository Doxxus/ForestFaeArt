# ADR 012: Public site redesign (Phase 9)

Status: **built and on staging, awaiting the developer's review** (12 Nov 2026). Direction agreed with the developer on 4 Nov. The developer asked to start Phase 9 early on 12 Nov, ahead of its 8 to 14 Dec window (Phase 8 follows it), so the window now serves as review and polish time. Feature freeze is still 14 Dec. See "What was built" at the end for the decisions made during the build, what was measured, and what is still open.

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
- **Open question for the build:** exact greens (to be shown as swatches against the cream panels for approval before they are applied everywhere). **Decided 12 Nov: "Spring meadow", see below.**
- **Open question for the build:** whether the footer's dark forest band stays or becomes part of the forest-floor scene. **Decided 12 Nov: it becomes the forest floor, see below.**

## What was built (12 Nov 2026)

### Decisions made when the build started

| Question | Decision |
|---|---|
| Exact greens | **Spring meadow** (fresh and airy): sky `#E3EFCF`, meadow `#B5D08A`, spring leaf `#7FAE5B`, forest floor `#2F4A3A` (the brand forest), plus in-between hills and canopy tones. Chosen over "Storybook forest" (deeper) and "Soft sage meadow" (closest to the old look). The full list is `world` in `packages/ui/src/tokens.ts` |
| Footer | The dark band **is the forest floor**: grass along its top edge, toadstools growing out of it, and fireflies drifting in it |
| Review rhythm | Palette, home scene and the calm inner pages first, then **pause for the developer's review on staging** before the polish pass (this is that pause) |

### How it works

- **One scene, never remounted.** `app/(site)/layout.tsx` wraps every public page in `.site-world` and renders `<World />` once: a fixed sky gradient, three picture layers (far hills, mid trunks and ferns, near grass and flowers), an evening tint, and a small pool of leaves and insects. Moving between pages does not reload it.
- **A page picks how much of the scene it wants with a marker.** The home page renders `<WorldLevel level="full" />`; every other page says nothing and is "calm". CSS reads the marker with `:has()`, so calm pages show the far hills and near grass only, with two leaves, and the home page adds the trunks, three more leaves and the insects. Browsers without `:has()` simply get the calm version everywhere.
- **Parallax is scroll-driven CSS.** Each layer is taller than what first shows (`--vis`) and rises by its own `--travel` (60, 140 and 190 px, far to near) across the page's scroll (`animation-timeline: scroll(root)`), so the far hills barely move and the grass moves most. The evening tint fades in the same way, and the page ends on the forest floor.
- **Toadstools** (`<Sprout>`, three drawings) stand on the top edge of reading panels and the footer, and grow with `animation-timeline: view()` as they scroll into view (small at the bottom of the screen, full size by the middle).
- **Leaves and insects** are a fixed pool (five leaves, a swallowtail and a dragonfly), each scroll-driven across its own slice of the page, with a time-based sway or wing-flap on the inner image. Insects only appear on the home page, from 640 px wide.
- **Reading panels** (`<Panel>`) are cream at 94% with a 4 px blur from 768 px up, and sit in front of the scene. Every public page's content is in one (the home page has one per section). The hero sits straight on the scene with a soft cream glow behind its words.
- **The "Coming soon" page** gets the same world, since it is the first thing anyone sees at the real address.
- **Art** is drawn by `packages/ui/scripts/kit/scenery.ts` (seeded, so it is identical every run), written to `apps/web/public/scene/` and `lib/scene-manifest.ts` by `pnpm --filter @ffa/ui kit`. The style guide (admin) shows the world's colours and every scenery piece.
- **No JavaScript was added** and no dependencies. All components are server components.

### Mobile budget, as measured

| Measure | Target | Result |
|---|---|---|
| JavaScript added | 0 KB | **0 KB** |
| Extra art on first load (home) | about 60 KB or less | **36 KB** of scenery (far 5.1, mid 19.2, near 11.5), plus the two hero moths that were already there. The insects, leaves, toadstools and footer grass are lazy and mostly below or beside the fold. A test fails above 60 KB |
| Scrolling layers at once on a phone | 3 or fewer, plus 2 or fewer drifting things | **3 layers** (far, mid, near) and **2 leaves**. Insects and the other three leaves are hidden below 640 px |
| Blur on a phone | cheap | **None** below 768 px (panels are simply opaque cream) |
| Layout shift | 0.05 or less | Every image has width and height from its manifest, layers are fixed-position, and nothing is inserted after load. **Not yet measured** |
| Lighthouse mobile and LCP | 90 or more, 2.5 s or less | **Not yet measured.** The staging site shows "Coming soon" to anyone not signed in, so it can't be scored there. Run it on the real address in Phase 8, or from a signed-in session on staging |
| Smooth scrolling on the developer's real phone | no visible stutter | **Still to do**: needs the developer's phone |

### Accessibility, as checked

- axe-core: **no violations** on the home page, portfolio, events, About, Contact and the not-found page, at 1280 px and at 375 px, with no sideways scrolling. (axe lists colour contrast as "needs review" over translucent panels, as the ADR predicted. See the next point.)
- Contrast is checked by calculation: `tokens.test.ts` lays the panel (cream at 94%) over the darkest thing in the scene (the forest floor) and requires 4.5:1 for ink, forest, moss and deep copper on top, and checks the hero's text on the sky and meadow. `PANEL_OPACITY` is one number shared by the test and the stylesheet (`world.test.ts` checks they agree).
- Reduced motion: checked in the browser. Nothing animates, the leaves and insects are not shown, the toadstools are fully grown, and the scene stands still. Browsers without scroll-driven animation get the same still scene, because every scroll-driven rule sits inside both `@supports` and `prefers-reduced-motion: no-preference` (a test parses `world.css` and fails if one doesn't).
- All scenery is `aria-hidden`, has empty alt text, and is never focusable. The skip link, focus rings, mobile menu and gallery are unchanged.

### Tests added

`packages/ui`: the scenery files exist, are within their budgets, are self-contained, use only brand and world colours, are up to date with the drawing code, and the first-load total stays within 60 KB; the world palette runs light to dark, and panel and hero contrast hold. `apps/web/tests/world.test.ts`: scroll-driven animation is always behind `@supports` and the no-preference media query, only compositor-friendly properties are animated, infinite animations respect reduced motion, blur is large-screen only, CSS variables match the tokens, and the admin never uses the scene.

### Departures from the plan

- **`content-visibility: auto` was not used.** It clips overflow, which would cut off the toadstools standing on panel edges, and the pages are short. Revisit only if Lighthouse asks for it.
- **Everything on the page now sits in a panel**, not only "cards and text panels", because the greens are too mid-tone for the moss secondary text to reach 4.5:1 directly on them.
- **The hero lost its corner ornaments and ferns**, which fought with the new grass and trunks. The luna moth, swallowtail, dragonfly and pollen stay.
- **The "Coming soon" page was redone too** (not in the original scope list, but it is the public face until publishing).

### Still open

- The developer's review of the look on staging (sign in, then browse the site in preview). Expect a few rounds on the art: trunks, grass density, how often things drift past, how many toadstools.
- Lighthouse mobile, LCP and CLS on the real address, and a scroll test on the developer's phone.
- Polish ideas not yet done: a gentle sun-glow behind the hero, toadstools in the footer that react to hover, and seasonal tinting.
