/**
 * Placeholder monochrome mark: a symmetric moth in a 100x100 box.
 * Replace with the approved brand mark once the logo direction is chosen (Phase 0 approval).
 */
export const LOGO_VIEWBOX = 100;

const RIGHT_WING_UPPER = "M52 47C58 22 86 12 94 28C98 40 82 52 54 55Z";
const RIGHT_WING_LOWER = "M54 58C76 58 90 70 82 84C74 94 60 84 54 66Z";
const BODY = "M50 30C54 30 55 36 55 44L55 80C55 86 53 90 50 90C47 90 45 86 45 80L45 44C45 36 46 30 50 30Z";
const ANTENNAE = "M48 32C44 22 38 16 32 14M52 32C56 22 62 16 68 14";

export function logoSvg(x: number, y: number, size: number): string {
  const s = size / LOGO_VIEWBOX;
  const wings = `<path d="${RIGHT_WING_UPPER}${RIGHT_WING_LOWER}"/>`;
  return (
    `<g transform="translate(${x} ${y}) scale(${s})" fill="#000">` +
    `${wings}<g transform="translate(100 0) scale(-1 1)">${wings}</g>` +
    `<path d="${BODY}"/>` +
    `<path d="${ANTENNAE}" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>` +
    `</g>`
  );
}
