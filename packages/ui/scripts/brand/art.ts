import type { Palette } from "./palette";

let counter = 0;
const nextId = (prefix: string) => `${prefix}${++counter}`;
const n = (v: number) => Math.round(v * 100) / 100;

type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

const cubicAt = ([a, b, c, d]: Cubic, t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
};

const quadAt = (a: Pt, b: Pt, c: Pt, t: number): { p: Pt; tan: Pt } => {
  const u = 1 - t;
  return {
    p: [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]],
    tan: [2 * u * (b[0] - a[0]) + 2 * t * (c[0] - b[0]), 2 * u * (b[1] - a[1]) + 2 * t * (c[1] - b[1])],
  };
};

const mirrored = (content: string) => `<g>${content}</g><g transform="scale(-1 1)">${content}</g>`;
const lens = (len: number, w: number) => `M0 0Q${n(len / 2)} ${n(w)} ${n(len)} 0Q${n(len / 2)} ${n(-w)} 0 0Z`;

/**
 * Stag beetle, top view, facing up. Origin at the centre of the body, about 190 wide and 215 tall.
 * Engraving style: ink outlines, hatched shading that follows the form, solid ink for head and jaws.
 */
export function stagBeetle(p: Palette): string {
  const cE = nextId("clipE");
  const cP = nextId("clipP");
  const E = "M2.5 3L28 3C43 5 50 22 50 46C50 72 38 92 22 98C12 102 4 98 2.5 90Z";
  const P = "M0 -44L18 -44C36 -42 44 -32 44 -18C44 -8 38 -2 28 0L0 0Z";

  const outerX = (y: number) => 2.5 + 47.5 * Math.pow(Math.sin(Math.PI * (0.12 + 0.82 * ((y - 3) / 99))), 0.5);
  const elytraHatch: string[] = [];
  for (let t = 0.1; t <= 1.02; t += 0.075) {
    if (t > 0.34 && t < 0.44) continue; // sheen
    const pts: string[] = [];
    for (let y = 2; y <= 100; y += 4) pts.push(`${pts.length ? "L" : "M"}${n(2.5 + (outerX(y) - 2.5) * t)} ${y}`);
    elytraHatch.push(`<path d="${pts.join("")}" stroke-width="${n(0.45 + 1.5 * t * t)}"/>`);
  }
  const pronotumHatch: string[] = [];
  for (let y = -42; y <= -1; y += 3.4) {
    const w = n(0.4 + 1.1 * Math.pow((y + 44) / 44, 2));
    pronotumHatch.push(`<path d="M0 ${n(y)}Q4 ${n(y + 1.5)} 8 ${n(y + 1)}M26 ${n(y + 1)}Q36 ${n(y + 3)} 46 ${n(y + 1)}" stroke-width="${w}"/>`);
  }

  const legs = [
    ["M38 -26L62 -44", "M62 -44L80 -34", "M80 -34L90 -24"],
    ["M46 6L74 2", "M74 2L88 18", "M88 18L94 32"],
    ["M44 42L70 56", "M70 56L80 80", "M80 80L82 94"],
  ]
    .map(([femur, tibia, tarsus]) =>
      [
        `<path d="${femur}" stroke-width="4.4"/>`,
        `<path d="${tibia}" stroke-width="3.2"/>`,
        `<path d="${tarsus}" stroke-width="1.7"/>`,
      ].join(""),
    )
    .join("");

  const half =
    `<g fill="none" stroke="${p.ink}" stroke-linecap="round" stroke-linejoin="round">${legs}</g>` +
    // antenna
    `<path d="M15 -57L27 -51L36 -58" fill="none" stroke="${p.ink}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M36 -58l5 -3M36 -58l6 0M36 -58l4 4" stroke="${p.ink}" stroke-width="1.6" stroke-linecap="round"/>` +
    // jaw: large antler-like pincer with a tooth, hooked inward at the tip
    `<path d="M12 -62C36 -66 56 -88 52 -112C50 -121 42 -125 33 -121C41 -116 43 -108 38 -100L30 -96L35 -89L24 -84L26 -77C22 -74 17 -72 12 -70Z" fill="${p.ink}"/>` +
    `<path d="M20 -66C38 -72 52 -88 50 -108" fill="none" stroke="${p.paper}" stroke-width="0.9" stroke-linecap="round"/>` +
    `<path d="M0 -70C10 -70 16 -64 17 -56L15 -46L0 -44Z" fill="${p.ink}"/>` +
    `<circle cx="14" cy="-57" r="2.4" fill="${p.paper}"/>` +
    // pronotum
    `<path d="${P}" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<g clip-path="url(#${cP})" fill="none" stroke="${p.ink}" stroke-linecap="round">${pronotumHatch.join("")}</g>` +
    // elytra
    `<path d="${E}" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<g clip-path="url(#${cE})" fill="none" stroke="${p.ink}" stroke-linecap="round">${elytraHatch.join("")}</g>`;

  return (
    `<defs><clipPath id="${cE}"><path d="${E}"/></clipPath><clipPath id="${cP}"><path d="${P}"/></clipPath></defs>` +
    mirrored(half)
  );
}

/**
 * Luna moth, top view, wings spread, facing up. Origin at the body centre, about 200 wide and 180 tall.
 */
export function lunaMoth(p: Palette): string {
  const cF = nextId("clipF");
  const cH = nextId("clipH");
  const FW: Cubic[] = [
    [[4, -18], [30, -42], [70, -62], [98, -56]],
    [[98, -56], [96, -34], [88, -10], [66, 8]],
    [[66, 8], [46, 16], [24, 12], [6, 4]],
  ];
  const HW: Cubic[] = [
    [[6, 0], [34, -6], [62, 2], [74, 20]],
    [[74, 20], [80, 34], [76, 56], [70, 78]],
    [[70, 78], [68, 88], [72, 98], [82, 110]],
    [[82, 110], [66, 102], [58, 92], [52, 78]],
    [[52, 78], [44, 56], [26, 38], [8, 28]],
  ];
  const cubicPath = (segs: Cubic[]) =>
    `M${segs[0]![0][0]} ${segs[0]![0][1]}` +
    segs.map(([, b, c, d]) => `C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}`).join("") +
    "Z";
  const fwPath = cubicPath(FW);
  const hwPath = cubicPath(HW);

  const veins = (anchor: Pt, segs: Cubic[], from: number, to: number, steps: number) => {
    const out: string[] = [];
    for (const seg of segs) {
      for (let i = 0; i <= steps; i++) {
        const q = cubicAt(seg, from + ((to - from) * i) / steps);
        out.push(`M${anchor[0]} ${anchor[1]}L${n(q[0])} ${n(q[1])}`);
      }
    }
    return `<path d="${out.join("")}" stroke-width="0.75"/>`;
  };
  const ticks = (anchor: Pt, segs: Cubic[]) => {
    const out: string[] = [];
    for (const seg of segs) {
      for (let t = 0.03; t < 1; t += 0.05) {
        const q = cubicAt(seg, t);
        const dx = anchor[0] - q[0];
        const dy = anchor[1] - q[1];
        const d = Math.hypot(dx, dy);
        const len = 5 + 4 * Math.abs(Math.sin(t * 9));
        out.push(`M${n(q[0])} ${n(q[1])}L${n(q[0] + (dx / d) * len)} ${n(q[1] + (dy / d) * len)}`);
      }
    }
    return `<path d="${out.join("")}" stroke-width="0.95"/>`;
  };
  const eye = (cx: number, cy: number, rx: number, ry: number, rot: number) =>
    `<g transform="translate(${cx} ${cy}) rotate(${rot})">` +
    `<ellipse rx="${rx}" ry="${ry}" fill="${p.paper}" stroke="${p.ink}" stroke-width="2"/>` +
    `<ellipse rx="${n(rx * 0.62)}" ry="${n(ry * 0.62)}" fill="${p.ink}"/>` +
    `<ellipse cx="${n(-rx * 0.18)}" cy="${n(-ry * 0.2)}" rx="${n(rx * 0.24)}" ry="${n(ry * 0.3)}" fill="${p.paper}"/></g>`;

  const wings =
    `<path d="${hwPath}" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<g clip-path="url(#${cH})" fill="none" stroke="${p.ink}" stroke-linecap="round">` +
    veins([8, 10], [HW[1]!, HW[2]!], 0, 1, 4) +
    ticks([8, 10], [HW[0]!, HW[1]!]) +
    `</g>` +
    eye(46, 22, 8, 10, 25) +
    `<path d="${fwPath}" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<g clip-path="url(#${cF})" fill="none" stroke="${p.ink}" stroke-linecap="round">` +
    veins([6, -8], [FW[1]!], 0, 1, 8) +
    ticks([6, -8], [FW[1]!]) +
    `<path d="M4 -18C30 -42 70 -62 98 -56" stroke-width="3.6"/>` +
    `</g>` +
    eye(68, -26, 8.5, 10.5, 30);

  // feathered antenna
  const A: Pt = [3, -35];
  const B: Pt = [14, -62];
  const C: Pt = [30, -74];
  const barbs: string[] = [];
  for (let t = 0.12; t < 0.97; t += 0.075) {
    const { p: q, tan } = quadAt(A, B, C, t);
    const d = Math.hypot(tan[0], tan[1]);
    const nx = -tan[1] / d;
    const ny = tan[0] / d;
    const len = 9 * (1 - t * 0.55);
    barbs.push(`M${n(q[0] - nx * len)} ${n(q[1] - ny * len)}L${n(q[0] + nx * len)} ${n(q[1] + ny * len)}`);
  }
  const antenna =
    `<path d="M${A[0]} ${A[1]}Q${B[0]} ${B[1]} ${C[0]} ${C[1]}" fill="none" stroke="${p.ink}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="${barbs.join("")}" fill="none" stroke="${p.ink}" stroke-width="0.9" stroke-linecap="round"/>`;

  const segments: string[] = [];
  for (let y = -6; y <= 40; y += 4.6) segments.push(`M${n(-7 + Math.abs(y - 14) * 0.02)} ${y}Q0 ${n(y + 2.6)} 7 ${y}`);
  const body =
    `<ellipse cx="0" cy="12" rx="7.2" ry="30" fill="${p.ink}"/>` +
    `<path d="${segments.join("")}" fill="none" stroke="${p.paper}" stroke-width="0.8"/>` +
    `<ellipse cx="0" cy="-14" rx="10.5" ry="14" fill="${p.ink}"/>` +
    `<path d="M-6 -22l2 3M-2 -25l1 4M3 -25l-1 4M7 -21l-2 3M-7 -12l3 1M7 -12l-3 1M-5 -6l3 -1M5 -6l-3 -1" stroke="${p.paper}" stroke-width="0.8" stroke-linecap="round"/>` +
    `<circle cx="0" cy="-32" r="6.6" fill="${p.ink}"/>` +
    `<circle cx="-3.2" cy="-33" r="1.5" fill="${p.paper}"/><circle cx="3.2" cy="-33" r="1.5" fill="${p.paper}"/>`;

  return (
    `<defs><clipPath id="${cF}"><path d="${fwPath}"/></clipPath><clipPath id="${cH}"><path d="${hwPath}"/></clipPath></defs>` +
    mirrored(wings + antenna) +
    body
  );
}

/** Pointed corner ornament. Origin is the frame corner, arms run along +x and +y. */
export function cornerOrnament(p: Palette, size = 64): string {
  const leaf = (len: number, w: number, angle: number) => `<path transform="rotate(${angle})" d="${lens(len, w)}"/>`;
  return (
    `<g fill="${p.ink}">` +
    leaf(size * 0.95, size * 0.12, 45) +
    leaf(size * 0.66, size * 0.085, 6) +
    leaf(size * 0.66, size * 0.085, 84) +
    leaf(size * 0.38, size * 0.055, 25) +
    leaf(size * 0.38, size * 0.055, 65) +
    `<circle cx="${n(size * 0.1)}" cy="${n(size * 0.1)}" r="${n(size * 0.05)}" fill="${p.paper}"/>` +
    `</g>`
  );
}

/** Four corner ornaments around a rectangle whose top-left corner is (x, y). */
export function frame(p: Palette, x: number, y: number, w: number, h: number, ornament = 64): string {
  const o = cornerOrnament(p, ornament);
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${p.ink}" stroke-width="3"/>` +
    `<rect x="${x + 11}" y="${y + 11}" width="${w - 22}" height="${h - 22}" fill="none" stroke="${p.ink}" stroke-width="1.2"/>` +
    `<g transform="translate(${x} ${y})">${o}</g>` +
    `<g transform="translate(${x + w} ${y}) scale(-1 1)">${o}</g>` +
    `<g transform="translate(${x} ${y + h}) scale(1 -1)">${o}</g>` +
    `<g transform="translate(${x + w} ${y + h}) scale(-1 -1)">${o}</g>`
  );
}

/** A fern frond growing from the origin upwards, curving to the right. */
export function fern(p: Palette, length = 200, leaflets = 14): string {
  const A: Pt = [0, 0];
  const B: Pt = [length * 0.06, -length * 0.55];
  const C: Pt = [length * 0.32, -length];
  const out: string[] = [`<path d="M${A[0]} ${A[1]}Q${B[0]} ${B[1]} ${C[0]} ${C[1]}" fill="none" stroke="${p.ink}" stroke-width="2" stroke-linecap="round"/>`];
  for (let i = 1; i <= leaflets; i++) {
    const t = i / (leaflets + 1);
    const { p: q, tan } = quadAt(A, B, C, t);
    const ang = (Math.atan2(tan[1], tan[0]) * 180) / Math.PI;
    const size = length * 0.2 * (1 - t * 0.8);
    for (const side of [-1, 1]) {
      out.push(
        `<path transform="translate(${n(q[0])} ${n(q[1])}) rotate(${n(ang + side * 62)})" d="${lens(size, size * 0.2)}" fill="${p.ink}"/>`,
      );
    }
  }
  return out.join("");
}

export { lens, mirrored, nextId };
