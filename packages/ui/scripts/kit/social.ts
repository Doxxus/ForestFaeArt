import { centredPath, loadBrandFonts } from "../brand/lettering";
import { frame, lunaMoth } from "../brand/art";
import { colour } from "../brand/palette";
import { swallowtail } from "./butterflies";
import { colors, resetIds } from "./toolkit";

/** The link-preview picture (1200 x 630): sage ground, framed corners, two insects and the foil name. */
export function ogImageSvg(): string {
  resetIds();
  const fonts = loadBrandFonts();
  const title = centredPath(fonts.flared, "FOREST FAE FOLK ART", 600, 352, 70, 7);
  const tagline = centredPath(fonts.flared, "HANDMADE INSECT ART", 600, 428, 30, 9);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">` +
    `<defs><radialGradient id="glow" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${colors.cream}" stop-opacity="0.6"/><stop offset="1" stop-color="${colors.cream}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="foil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.copper}"/><stop offset="0.5" stop-color="#A0652F"/><stop offset="1" stop-color="${colors.copperDeep}"/></linearGradient></defs>` +
    `<rect width="1200" height="630" fill="${colors.sage}"/><rect width="1200" height="630" fill="url(#glow)"/>` +
    frame(colour, 28, 28, 1144, 574, 70) +
    `<g transform="translate(215 168) scale(0.82)">${lunaMoth(colour)}</g>` +
    `<g transform="translate(990 492) scale(0.52)">${swallowtail({ ...colour, ground: "transparent" })}</g>` +
    `<path d="${title}" fill="none" stroke="${colors.cream}" stroke-width="9" stroke-linejoin="round"/>` +
    `<path d="${title}" fill="url(#foil)"/>` +
    `<path d="${tagline}" fill="${colors.forest}"/>` +
    `</svg>`
  );
}

/** The touch icon: the small moth on cream, with room around it so rounded corners never clip it. */
export function touchIconSvg(markInner: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180"><rect width="180" height="180" fill="${colors.cream}"/>` +
    `<g transform="translate(90 96) scale(0.38)">${markInner}</g></svg>`
  );
}
