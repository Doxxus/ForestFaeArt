/**
 * The small brand mark (ADR 005): a geometric moth made of four leaf shapes, a body and two antennae.
 * Solid black shapes only, so it stays clear at 24 px and prints well on the one-colour thermal labels.
 * Drawn in a 250 x 250 box centred on the body.
 */
export const LOGO_VIEWBOX = 250;

const lens = (len: number, w: number) => `M0 0Q${len / 2} ${w} ${len} 0Q${len / 2} ${-w} 0 0Z`;

const HALF =
  `<g transform="rotate(-36)"><path d="${lens(150, 52)}"/></g>` +
  `<g transform="rotate(38)"><path d="${lens(118, 46)}"/></g>` +
  `<path d="M5 -50C16 -78 34 -92 54 -96" fill="none" stroke="#000" stroke-width="9" stroke-linecap="round"/>`;

const BODY = `<g transform="translate(0 -64) rotate(90)"><path d="${lens(130, 13)}"/></g>`;

/** Draws the mark inside a square of `size` px at (x, y), in black. */
export function logoSvg(x: number, y: number, size: number): string {
  const s = size / LOGO_VIEWBOX;
  // The mark spans about y -100..+75, so shift it down a little to sit in the middle of the square.
  return (
    `<g transform="translate(${x + size / 2} ${y + size / 2 + 12.5 * s}) scale(${s})" fill="#000">` +
    `<g>${HALF}</g><g transform="scale(-1 1)">${HALF}</g>${BODY}</g>`
  );
}
