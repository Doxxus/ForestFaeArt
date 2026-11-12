/**
 * Brand colour tokens (ADR 005). Never use pure black or harsh white, and never neon.
 * Each token says where it may be used for text so the contrast rules in tokens.test.ts hold.
 */
export const colors = {
  // Neutrals
  cream: "#F4EFE3", // page background
  parchment: "#EFE6CF", // cards, panels
  stone: "#D6CFBF", // borders, dividers
  ink: "#2B1E16", // body text (deep brown, not black)

  // Greens
  forest: "#2F4A3A", // headings, primary buttons, brand mark
  moss: "#556B3A", // secondary text and links on cream
  fern: "#6F8A55", // graphics and large accents only
  sage: "#B7C3A3", // brand ground (banner), tints

  // Metals
  champagne: "#E8D9B0",
  gold: "#D9B15A", // graphics and large display text only
  copper: "#B4733A", // graphics and large display text only
  copperDeep: "#86522A", // copper that must work as normal-size text on cream
} as const;

export type ColorToken = keyof typeof colors;

/**
 * The public site's green world (ADR 012). Site-only: the admin never uses these.
 * Ordered from the sky down to the forest floor. The scenery art and the `.site-world` CSS variables both come from here.
 */
export const world = {
  sky: "#E3EFCF", // the top of the page, and the hero
  mist: "#D2E5B4", // the farthest hills
  hillFar: "#C3DB9A",
  meadow: "#B5D08A",
  hillMid: "#9AC46D",
  leaf: "#7FAE5B", // spring leaf
  canopy: "#5E9150",
  pine: "#3F7447",
  bark: "#6A5638", // distant trunks
  floor: "#2F4A3A", // the forest floor: the same as brand forest, and the darkest thing in the scene
} as const;

export type WorldToken = keyof typeof world;

/** How opaque the cream reading panels are over the scene (ADR 012: "a little transparency", capped so text contrast always holds). */
export const PANEL_OPACITY = 0.94;

export const fonts = {
  // Self-hosted, SIL OFL. The wordmark outlines are already in the SVG kit.
  display: "Marcellus", // headings and the wordmark (flared serif capitals)
  mark: "Cormorant SC", // refined small caps for the compact lockup
  body: "system-ui", // readable sans for long text, replaced when the body font is chosen
} as const;

/** Text and background pairs that the design system allows, with the AA level each must meet. */
export const textPairs: Array<{ fg: ColorToken; bg: ColorToken; use: string; level: "normal" | "large" }> = [
  { fg: "ink", bg: "cream", use: "body text on page", level: "normal" },
  { fg: "ink", bg: "parchment", use: "body text on cards", level: "normal" },
  { fg: "forest", bg: "cream", use: "headings and links", level: "normal" },
  { fg: "forest", bg: "parchment", use: "headings on cards", level: "normal" },
  { fg: "moss", bg: "cream", use: "secondary text", level: "normal" },
  { fg: "copperDeep", bg: "cream", use: "accent text", level: "normal" },
  { fg: "cream", bg: "forest", use: "text on primary buttons", level: "normal" },
  { fg: "champagne", bg: "forest", use: "text on dark sections", level: "normal" },
  { fg: "ink", bg: "sage", use: "text on the sage ground", level: "normal" },
  { fg: "copper", bg: "cream", use: "large display accents only", level: "large" },
  { fg: "gold", bg: "forest", use: "large display accents on dark", level: "large" },
];
