# ADR 011: Public website (Phase 4)

Status: **accepted** (3 Nov 2026, Phase 4). Built, tested and deployed to staging. It was pulled forward from 24 Nov so the QR labels in Phase 5 open a real page. See "Built so far" at the end.

## Decisions

### Structure and rendering

- **One web app, two areas.** The public site lives in a route group `app/(site)` with its own header, footer and "Coming soon" gate. The admin stays under `/admin`. Pages are server components that call the API's **public** procedures. When a staff member is signed in, their token is forwarded so they can preview an unpublished site (WEB-18), and a banner says so.
- **Coming soon mode (WEB-18).** While `siteLive` is off, every public route shows one branded page with no product, event or customer data. The `/p/<sku>` QR route shows a friendly version of it. Signed-in staff see the real site with a "Preview, not public yet" banner.
- **`/p/<sku>` is the QR target** and is the one route that must never break: it redirects to `/portfolio/<slug>` once live, resolves old slugs, and shows a friendly "this piece is not on the website yet" page for a piece that is hidden, a draft or photo-less. Labels printed today keep working after any later slug change.
- **Search engines.** Indexing needs **both** `siteLive` and the environment flag `VITE_INDEXABLE=true`. Staging never sets the flag, so staging stays out of search results even when its site is switched live for testing (HAND-0). `robots.txt`, the `robots` meta tag and `sitemap.xml` all follow that one rule. The canonical host comes from `VITE_SITE_URL`.

### Portfolio

- **Server-rendered, URL-synced, works without JavaScript.** `/portfolio?q=&category=&sort=&show=&f.<field>=&page=`. A plain GET form does the filtering, so every state is a shareable link and the back button works. Numbered pages instead of infinite scroll: easier for keyboards and screen readers, no scroll-position bugs, and no client JavaScript.
- **Search, sort and filters run in the API over the public set.** At this catalogue size (tens to a few hundred pieces) the API loads the visible pieces once and filters, sorts and counts them in code. This keeps one set of visibility rules (WEB-14) in one place and makes facet counts trivial. If the catalogue ever passes about 1,000 visible pieces, move the filtering into SQL. The search is a case-insensitive "contains" match over title, description, SKU, category names and public field values, not full-text search.
- **Sorting:** newest, featured, price (low to high, high to low) and title. Pieces with a hidden price always sort last for price, so sorting cannot reveal a hidden price. Price sorting is not offered when "Show prices" is off.
- **Availability:** everything is shown by default, with a tasteful "Sold" marker (WEB-4). A filter shows only available pieces.
- **Field filters** appear only for fields the owner marked public **and** filterable, with counts.

### Visibility and privacy

- The public set is exactly what `toPublicProduct` allows (a whitelist, WEB-14). The new public procedures never select cost, quantity, notes, internal status or private fields. `PENDING_PAYMENT` and `AT_EVENT` read as available. Tests assert that drafts, archived pieces, hidden pieces, photo-less pieces (unless the setting allows them) and private fields never appear in any public response, including search, facets, related pieces and the sitemap.
- **Inquiries** use the existing `inquiries.submit` (honeypot, rate limit, optional Turnstile, [ADR 010](./010-events-content-inquiries.md)). The contact form shows the Turnstile widget only when `VITE_TURNSTILE_SITE_KEY` is set, so the site key and the secret can be added in either order ([staging.md](../staging.md#turnstile-not-switched-on-yet)).

### Design system and art

- **Styling:** Tailwind with the brand tokens already in the theme ([ADR 009](./009-admin-web-app.md)). Headings in Marcellus. **Body text stays on the system font stack for now**: no extra font download keeps the mobile LCP target easy (UX-6). A self-hosted body serif is a possible later polish.
- **SVG kit (UX-2, UX-9):** assets are drawn by code in an engraving style (extending `packages/ui/scripts/brand/art.ts`), written as plain `.svg` files, optimised with SVGO, and served from `apps/web/public/kit/` as cacheable images. Large decorative art is used through `<img>`/CSS with `loading="lazy"` and `aria-hidden` (zero JavaScript, shared browser cache). Colours are fixed to the brand tokens when generated. The small mark is also inlined as an SVG component, because it sits in the header on every page. A test enforces a size budget per asset. The whole minimum set from UX-2 was drawn in one go rather than a core 12 first, since the generator made the rest cheap.
- **Motion (UX-3, UX-4):** CSS only. A layered hero with slowly drifting moths and a few pollen specks, gentle lift on hover, and a short fade-in. Everything sits inside `@media (prefers-reduced-motion: no-preference)`, so reduced-motion visitors get a still page that works identically.
- **Accessibility (UX-5):** semantic landmarks, a skip link, visible focus, labelled form controls, `alt` text from the owner's photo descriptions (falling back to the piece title), decorative art `aria-hidden`, and keyboard-usable gallery and filters.
- **Style guide:** a staff-only page previews every asset, colour and type style.

## Tradeoffs

| Choice | Why | Cost |
|---|---|---|
| Numbered pages over infinite scroll | Accessible, no-JS, shareable | One more click for a long list |
| Filter in code, not SQL | One visibility rule, simple facets | Revisit above about 1,000 visible pieces |
| Generated static SVG files, not inline components | Cacheable, lazy, no JS, small HTML | Colours are fixed at generation (fine for one brand) |
| System body font | Fastest LCP, no licence work | Less bookish than a serif body |
| Server-rendered pages without a CDN cache yet | Staff preview needs a per-request token | Add edge caching for anonymous visitors in Phase 8 (headers, cache) |

## Not in this phase

- Online buying (Store Mode `ONLINE_STORE` shows an Inquire option for now, P2 payments later).
- Cloudflare Web Analytics (WEB-13) needs a token from the dashboard: the optional `VITE_ANALYTICS_TOKEN` hook exists and is off until a token is set.
- Security headers and CSP (Phase 8, with this site's final needs known).
- Production domain wiring (`forestfae.ca` on the web Worker): done at cut-over in Phase 8.

## Built so far

**API** (all in `apps/api`, public rules in one place, `services/portfolio.ts`):

- `catalog.search` (search, category, available-only, field filters, sort, numbered pages, facet counts), `catalog.categories`, `catalog.get` (now with related pieces), and `site.sitemap`. Tests (`test/portfolio.test.ts`) assert that drafts, hidden pieces, photo-less pieces, cost, stock and private fields never appear in any public response, that a hidden price is never leaked by sorting, and that nothing is returned before the site is published.
- A new public setting, `publicEmail` (shown on the contact page and in the footer), because the inbox address is deliberately private. The `tagline` default is now "Handmade insect art".

**Website** (`apps/web/app/(site)`):

- Home (layered hero, featured work, browse by kind, events, welcome text), Portfolio, Product page (swipeable gallery with a zoom view, details, related pieces, "Ask about this piece"), Events and event pages (opening hours, map link, add to calendar), About (with the sourcing statement), Contact, Privacy and Terms.
- The "Coming soon" gate, the staff "Preview" banner, the `/p/<sku>` QR route, branded 404 and error pages, `robots.txt` and `sitemap.xml` that follow the indexing rule above, per-page titles, canonical links, Open Graph and `Product`, `Event` and `Organization` structured data.
- The contact and product forms: honeypot, the API's per-visitor limit, and the Turnstile widget when `VITE_TURNSTILE_SITE_KEY` is set.
- Filtered and searched portfolio views are `noindex`, and a form's empty fields are tidied out of the address.

**Art and brand** (`packages/ui/scripts/kit`, output in `apps/web/public/kit`): 19 assets, 85 KB in all: luna moth, atlas moth, morpho and swallowtail butterflies, stag beetle, scarab, dragonfly, cicada, spider, centipede, mushrooms, leaf sprig, branch, wildflowers, fern, corner ornament, two dividers (light and dark grounds) and the small mark. Also the favicon, the touch icon and the 1200 x 630 link-preview picture. `packages/ui/src/kit.test.ts` enforces a size budget per file, that nothing is external or scripted or uses text, that only brand colours appear, and that the committed files match what the drawing code makes today (so nobody edits an asset by hand and forgets to regenerate). The staff-only style guide is at `/admin/style-guide`.

**Where the art is placed:** home hero (luna moth, swallowtail, dragonfly, ferns, corners); `SectionHeading` and every page title use the vine divider; the Portfolio, Events, About and Contact titles get a creature on each side from 1024px up (`PageHeader`, hidden on smaller screens so it never crowds the words); empty and missing-page states use a small picture (`EmptyArt`: mushrooms, centipede, spider, leaf sprig); the footer uses the light vine divider; the Coming soon page and the About sourcing box use the corner and the fern. Product pages, legal pages and the owner screens are deliberately plain. Add art with `<Kit name="…" />`, and keep it decorative.

## Settings per environment

Set in `apps/web/.env.production` (the one used when deployed) and `.env.development`:

| Setting | Purpose | Staging | Production |
|---|---|---|---|
| `VITE_API_URL` | Where the API lives | the staging API | the production API |
| `VITE_SITE_URL` | Canonical address, sitemap | the staging web address | `https://forestfae.ca` |
| `VITE_INDEXABLE` | Lets search engines in (together with the owner's Publish button) | unset | `true` |
| `VITE_TURNSTILE_SITE_KEY` | Shows the "are you a person" check on the forms | unset | when wanted, see [staging.md](../staging.md#turnstile-not-switched-on-yet) |
| `VITE_ANALYTICS_TOKEN` | Cloudflare Web Analytics (WEB-13), counts real visitors only, no cookies | unset | when a token exists |

## Checked

- Lint, typecheck, unit tests and the build all pass.
- axe-core (WCAG 2.1 A and AA plus best practice) reports no violations on the home page, portfolio (with and without filters), a product page, events, an event, About, Contact, Privacy, the "not on the website yet" page, the 404 page, the style guide, settings and the dashboard. The foil title is a gradient, so axe cannot measure it: it is kept between copper and deep copper, which is 3.4:1 or better against its cream outline (large text needs 3:1).
- In a real browser: search, sort, filters and the tidy address, the QR route (known piece, unknown piece), the contact and product forms (the honeypot submission is saved nowhere), the Coming soon gate (anonymous visitors see nothing else, search engines are blocked, the sitemap is closed), the mobile menu, the gallery zoom view with the Escape key, and reduced motion (the animation is switched off, so the page is still).

## Not built yet

- Cloudflare Web Analytics and Turnstile are wired but need their keys (see the table).
- Loaders (the small animated mark), and the wing-flap animation (the hero drifts gently, which keeps it CSS-only and cheap).
- Edge caching for anonymous visitors, security headers and CSP (Phase 8).
- Lighthouse scores on the deployed site (to measure once the production domain is in front of the Worker, Phase 8).
- Pieces shown on each event page ("coming to this market").
