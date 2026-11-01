import { fern, frame, lens, lunaMoth, nextId, stagBeetle } from "./art";
import { arcText, centredPath, trackedWidth, type BrandFonts } from "./lettering";
import type { Palette } from "./palette";

export interface Artwork {
  svg: string;
  width: number;
  height: number;
}

const wrap = (w: number, h: number, inner: string, extraDefs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${extraDefs}${inner}</svg>`;

const gradient = (id: string, p: Palette) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${p.gold}"/><stop offset="0.55" stop-color="${p.copper}"/><stop offset="1" stop-color="${p.copperDeep}"/>` +
  `</linearGradient></defs>`;

// ---------------------------------------------------------------------------------------------
// Direction A: Naturalist Banner. The owner's printed banner, evolved: sage ground, engraved
// insects around a flared small-caps wordmark in copper and gold foil with a cream outline,
// pointed corner ornaments.
// ---------------------------------------------------------------------------------------------
export function directionALockup(p: Palette, fonts: BrandFonts): Artwork {
  const W = 1400;
  const H = 700;
  const g = nextId("gradA");
  const main = centredPath(fonts.flared, "FOREST FAE", W / 2, 322, 124, 6);
  const sub = centredPath(fonts.flared, "FOLK ART", W / 2, 424, 56, 30);
  const mainW = trackedWidth(fonts.flared, "FOREST FAE", 124, 6);
  const subW = trackedWidth(fonts.flared, "FOLK ART", 56, 30);
  const ruleY = 404;
  const left = W / 2 - mainW / 2;
  const right = W / 2 + mainW / 2;
  const outline = p.mono
    ? ""
    : `<g fill="none" stroke="${p.outline}" stroke-width="9" stroke-linejoin="round"><path d="${main}"/><path d="${sub}"/></g>`;
  const inner =
    `<rect width="${W}" height="${H}" fill="${p.ground}"/>` +
    frame(p, 28, 28, W - 56, H - 56, 112) +
    `<g transform="translate(176 340) rotate(-14) scale(1.18)">${stagBeetle(p)}</g>` +
    `<g transform="translate(1228 336) rotate(12) scale(1.2)">${lunaMoth(p)}</g>` +
    outline +
    `<g fill="url(#${g})"><path d="${main}"/><path d="${sub}"/></g>` +
    `<g stroke="${p.ink}" stroke-width="2.2"><path d="M${left} ${ruleY}H${W / 2 - subW / 2 - 28}M${W / 2 + subW / 2 + 28} ${ruleY}H${right}"/></g>` +
    `<path d="M${W / 2 - 150} 492H${W / 2 + 150}" stroke="${p.ink}" stroke-width="1.2"/>` +
    `<path d="M${W / 2 - 8} 492l8 -8l8 8l-8 8z" fill="${p.ink}"/>`;
  return { svg: wrap(W, H, inner, gradient(g, p)), width: W, height: H };
}

export function directionAIcon(p: Palette): Artwork {
  const S = 512;
  const inner =
    `<rect width="${S}" height="${S}" rx="96" fill="${p.ground}"/>` +
    `<rect x="14" y="14" width="${S - 28}" height="${S - 28}" rx="84" fill="none" stroke="${p.ink}" stroke-width="6"/>` +
    `<g transform="translate(256 270) scale(1.72)">${stagBeetle(p)}</g>`;
  return { svg: wrap(S, S, inner), width: S, height: S };
}

// ---------------------------------------------------------------------------------------------
// Direction B: Specimen Seal. A round naturalist's stamp: moth in the centre, lettering around the
// ring, double rules. Works as a label stamp, packaging seal and social avatar.
// ---------------------------------------------------------------------------------------------
export function directionBLockup(p: Palette, fonts: BrandFonts): Artwork {
  const S = 900;
  const c = S / 2;
  const ring = (r: number, w: number) => `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${p.ink}" stroke-width="${w}"/>`;
  const diamond = (x: number, y: number) => `<path transform="translate(${x} ${y})" d="M-11 0L0 -11L11 0L0 11Z" fill="${p.ink}"/>`;
  const dots = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y - 26}" r="3.5" fill="${p.ink}"/><circle cx="${x}" cy="${y + 26}" r="3.5" fill="${p.ink}"/>`;
  const inner =
    `<rect width="${S}" height="${S}" fill="${p.ground}"/>` +
    ring(424, 5) +
    ring(412, 1.5) +
    ring(300, 1.5) +
    ring(288, 4) +
    `<g fill="${p.ink}" transform="translate(${c} ${c})">` +
    arcText(fonts.flared, "FOREST FAE", 66, 14, 322, "top") +
    arcText(fonts.flared, "FOLK ART", 66, 22, 384, "bottom") +
    `</g>` +
    diamond(c - 356, c) +
    diamond(c + 356, c) +
    dots(c - 356, c) +
    dots(c + 356, c) +
    `<g transform="translate(${c - 196} ${c + 150}) rotate(-28)">${fern(p, 120, 10)}</g>` +
    `<g transform="translate(${c + 196} ${c + 150}) scale(-1 1) rotate(-28)">${fern(p, 120, 10)}</g>` +
    `<g transform="translate(${c} ${c - 8}) scale(1.62)">${lunaMoth(p)}</g>`;
  return { svg: wrap(S, S, inner), width: S, height: S };
}

export function directionBIcon(p: Palette): Artwork {
  const S = 512;
  const c = S / 2;
  const inner =
    `<rect width="${S}" height="${S}" fill="${p.ground}"/>` +
    `<circle cx="${c}" cy="${c}" r="238" fill="none" stroke="${p.ink}" stroke-width="9"/>` +
    `<circle cx="${c}" cy="${c}" r="218" fill="none" stroke="${p.ink}" stroke-width="3"/>` +
    `<g transform="translate(${c} ${c - 6}) scale(1.4)">${lunaMoth(p)}</g>`;
  return { svg: wrap(S, S, inner), width: S, height: S };
}

// ---------------------------------------------------------------------------------------------
// Direction C: Minimal Mark. A geometric moth built from four leaf shapes, with a refined
// small-caps wordmark. Cleanest at small sizes and on one-colour thermal labels.
// ---------------------------------------------------------------------------------------------
function geometricMoth(p: Palette): string {
  const forewing = `<path d="${lens(150, 52)}"/>`;
  const hindwing = `<path d="${lens(118, 46)}"/>`;
  const half =
    `<g fill="${p.forest}" transform="rotate(-36)">${forewing}</g>` +
    `<g fill="${p.copper}" transform="rotate(38)">${hindwing}</g>` +
    `<path d="M5 -50C16 -78 34 -92 54 -96" fill="none" stroke="${p.forest}" stroke-width="5" stroke-linecap="round"/>`;
  return (
    `<g><g>${half}</g><g transform="scale(-1 1)">${half}</g>` +
    `<path transform="translate(0 -64) rotate(90)" d="${lens(130, 11)}" fill="${p.ink}"/></g>`
  );
}

export function directionCLockup(p: Palette, fonts: BrandFonts): Artwork {
  const SIZE = 104;
  const TRACK = 12;
  const mainW = trackedWidth(fonts.refined, "FOREST FAE", SIZE, TRACK);
  const textX = 420;
  const W = Math.ceil(textX + mainW + 90);
  const H = 440;
  const bg = p.mono ? p.ground : "#F4EFE3";
  const tx = textX + mainW / 2;
  const main = centredPath(fonts.refined, "FOREST FAE", tx, 222, SIZE, TRACK);
  const sub = centredPath(fonts.refined, "FOLK ART", tx, 312, 46, 40);
  const inner =
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<g transform="translate(240 222) scale(1.18)">${geometricMoth(p)}</g>` +
    `<g fill="${p.forest}"><path d="${main}"/></g>` +
    `<g fill="${p.copper}"><path d="${sub}"/></g>` +
    `<path d="M${textX} 258H${textX + mainW}" stroke="${p.ink}" stroke-width="1.6"/>`;
  return { svg: wrap(W, H, inner), width: W, height: H };
}

export function directionCIcon(p: Palette): Artwork {
  const S = 512;
  const bg = p.mono ? p.ground : "#F4EFE3";
  const inner =
    `<rect width="${S}" height="${S}" rx="96" fill="${bg}"/>` +
    `<g transform="translate(256 262) scale(1.45)">${geometricMoth(p)}</g>`;
  return { svg: wrap(S, S, inner), width: S, height: S };
}
