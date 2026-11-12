import { optimize } from "svgo";
import { world } from "../../src/tokens";
import { paintedBounds } from "./build";
import { colors, n, resetIds, uid, type Pt } from "./toolkit";

/**
 * The scenery for the public site's green world (ADR 012): hills, trunks and grass in three depth layers,
 * toadstools that grow as you scroll, and leaves that drift past. Flat shapes in the world palette, so they read as
 * distant and soft, with the engraved line style kept for the small things in front (toadstools and leaves).
 * Everything is drawn in code, deterministic, and optimised like the rest of the kit.
 */

const W = 1600;
const TAU = Math.PI * 2;
const INK = colors.ink;

/** A small seeded random number generator, so the drawing is identical on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ridge = (y0: number, amp: number, wl: number, phase: number) => (x: number) => y0 + amp * (0.62 * Math.sin((x / wl) * TAU + phase) + 0.38 * Math.sin((x / wl) * TAU * 2.7 + phase * 1.9));

/** A filled hill: a smooth ridge with solid ground beneath it down to the bottom edge. */
function hill(y: (x: number) => number, height: number, fill: string): string {
  const step = 40;
  const pts: Pt[] = [];
  for (let x = -step; x <= W + step; x += step) pts.push([x, y(x)]);
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    d += `Q${n(a[0])} ${n(a[1])} ${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`;
  }
  d += `L${W + step} ${height}L${-step} ${height}Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}

const pine = (x: number, y: number, h: number, w: number) =>
  `M${n(x)} ${n(y - h)}L${n(x + w * 0.42)} ${n(y - h * 0.52)}L${n(x + w * 0.22)} ${n(y - h * 0.52)}L${n(x + w * 0.5)} ${n(y - h * 0.2)}L${n(x + w * 0.12)} ${n(y - h * 0.2)}V${n(y)}H${n(x - w * 0.12)}V${n(y - h * 0.2)}L${n(x - w * 0.5)} ${n(y - h * 0.2)}L${n(x - w * 0.22)} ${n(y - h * 0.52)}L${n(x - w * 0.42)} ${n(y - h * 0.52)}Z`;

const round = (x: number, y: number, r: number) => `M${n(x - 2)} ${n(y)}V${n(y - r)}H${n(x + 2)}V${n(y)}ZM${n(x - r)} ${n(y - r * 1.5)}a${n(r)} ${n(r * 1.15)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r * 1.15)} 0 1 0 ${n(-r * 2)} 0Z`;

/** The farthest layer: pale hills and tree lines in the haze. 1600 x 600, the ridge at the top. */
export function farLayer(): string {
  const rand = rng(11);
  const r1 = ridge(150, 34, 1100, 0.6);
  const r2 = ridge(250, 30, 800, 2.1);
  const r3 = ridge(350, 26, 700, 4.0);
  const pines: string[] = [];
  for (let x = 20; x < W; x += 26 + rand() * 30) pines.push(pine(x, r1(x) + 6, 46 + rand() * 54, 22 + rand() * 12));
  const blobs: string[] = [];
  for (let x = 40; x < W; x += 60 + rand() * 80) blobs.push(round(x, r2(x) + 4, 20 + rand() * 18));
  return (
    hill(r1, 600, world.mist) +
    `<path d="${pines.join("")}" fill="${world.hillFar}"/>` +
    hill(r2, 600, world.hillFar) +
    `<path d="${blobs.join("")}" fill="${world.meadow}"/>` +
    hill(r3, 600, world.meadow)
  );
}

/** A fern frond: a curved stem with leaflets that shorten towards the tip. */
function frond(x: number, y: number, len: number, lean: number): string {
  const tip: Pt = [x + lean, y - len];
  const mid: Pt = [x + lean * 0.15, y - len * 0.62];
  const leaflets: string[] = [];
  const count = 8;
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mid[0] + t * t * tip[0];
    const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * mid[1] + t * t * tip[1];
    const l = len * 0.3 * (1 - t * 0.7);
    for (const side of [-1, 1]) {
      const ex = px + side * l;
      const ey = py - l * 0.28;
      leaflets.push(`M${n(px)} ${n(py)}Q${n(px + side * l * 0.5)} ${n(py - l * 0.42)} ${n(ex)} ${n(ey)}Q${n(px + side * l * 0.5)} ${n(py - l * 0.08)} ${n(px)} ${n(py)}Z`);
    }
  }
  return `M${n(x)} ${n(y)}Q${n(mid[0])} ${n(mid[1])} ${n(tip[0])} ${n(tip[1])}` + leaflets.join("");
}

/** The middle layer: trunks fading into the haze above, with a fern-covered hill in front. 1600 x 900. */
export function midLayer(): string {
  const rand = rng(23);
  const fade = uid("t");
  const trunks: string[] = [];
  const xs = [90, 250, 420, 610, 800, 985, 1170, 1350, 1520];
  for (const base of xs) {
    const x = base + (rand() - 0.5) * 70;
    const w = 34 + rand() * 40;
    const lean = (rand() - 0.5) * 50;
    const top = 40 + rand() * 120;
    trunks.push(`M${n(x - w / 2)} 760C${n(x - w * 0.42)} 520 ${n(x - w * 0.3 + lean)} 300 ${n(x - w * 0.22 + lean)} ${n(top)}H${n(x + w * 0.22 + lean)}C${n(x + w * 0.3 + lean)} 300 ${n(x + w * 0.42)} 520 ${n(x + w / 2)} 760Z`);
  }
  const hillY = ridge(610, 40, 760, 1.2);
  const ferns: string[] = [];
  const front: string[] = [];
  for (let x = 40; x < W; x += 95 + rand() * 70) {
    const base = hillY(x) + 14;
    const len = 90 + rand() * 80;
    const target = rand() > 0.5 ? ferns : front;
    target.push(frond(x, base, len, -60 + rand() * 40), frond(x + 6, base, len * 0.8, 36 + rand() * 40));
  }
  const stars: string[] = [];
  for (let i = 0; i < 16; i++) {
    const x = 60 + rand() * (W - 120);
    const y = hillY(x) + 30 + rand() * 90;
    stars.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(2.5 + rand() * 2.5)}" fill="${i % 3 === 0 ? colors.gold : colors.champagne}"/>`);
  }
  return (
    `<defs><linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${world.bark}" stop-opacity="0"/><stop offset=".38" stop-color="${world.bark}" stop-opacity=".62"/><stop offset="1" stop-color="${world.bark}" stop-opacity=".8"/></linearGradient></defs>` +
    `<path d="${trunks.join("")}" fill="url(#${fade})"/>` +
    hill(hillY, 900, world.hillMid) +
    `<path d="${ferns.join("")}" fill="${world.leaf}" stroke="${world.leaf}" stroke-width="2" stroke-linecap="round"/>` +
    hill((x) => hillY(x) + 90 + 26 * Math.sin(x / 130), 900, world.leaf) +
    `<path d="${front.join("")}" fill="${world.canopy}" stroke="${world.canopy}" stroke-width="2" stroke-linecap="round"/>` +
    stars.join("")
  );
}

/** A grass blade leaning to one side. */
const blade = (x: number, y: number, h: number, lean: number, w: number) => `M${n(x - w)} ${n(y)}Q${n(x + lean * 0.3)} ${n(y - h * 0.55)} ${n(x + lean)} ${n(y - h)}Q${n(x + lean * 0.6 + w)} ${n(y - h * 0.5)} ${n(x + w)} ${n(y)}Z`;

/** The nearest layer: tall grass, a few meadow flowers and solid forest ground below. 1600 x 520. */
export function nearLayer(): string {
  const rand = rng(37);
  const y = ridge(150, 16, 520, 0.9);
  const back: string[] = [];
  const mid: string[] = [];
  const front: string[] = [];
  for (let x = -10; x < W + 10; x += 12 + rand() * 14) back.push(blade(x, y(x) + 8, 60 + rand() * 70, (rand() - 0.5) * 34, 5 + rand() * 3));
  for (let x = 0; x < W; x += 16 + rand() * 18) mid.push(blade(x, y(x) + 12, 50 + rand() * 80, (rand() - 0.5) * 44, 6 + rand() * 4));
  for (let x = 10; x < W; x += 30 + rand() * 40) front.push(blade(x, y(x) + 18, 70 + rand() * 90, (rand() - 0.5) * 60, 7 + rand() * 4));
  const flowers: string[] = [];
  for (let i = 0; i < 14; i++) {
    const x = 50 + (i * (W - 100)) / 13 + (rand() - 0.5) * 50;
    const top = y(x) - 70 - rand() * 70;
    const petal = i % 2 === 0 ? colors.champagne : colors.cream;
    flowers.push(
      `<path d="M${n(x)} ${n(y(x) + 10)}Q${n(x + 6)} ${n((y(x) + top) / 2)} ${n(x + 2)} ${n(top)}" fill="none" stroke="${world.pine}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<circle cx="${n(x + 2)}" cy="${n(top)}" r="9" fill="${petal}"/><circle cx="${n(x + 2)}" cy="${n(top)}" r="4" fill="${i % 3 === 0 ? colors.copper : colors.gold}"/>`,
    );
  }
  const ground = uid("g");
  return (
    `<defs><linearGradient id="${ground}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${world.pine}"/><stop offset=".55" stop-color="${world.floor}"/></linearGradient></defs>` +
    `<path d="${back.join("")}" fill="${world.canopy}"/>` +
    flowers.join("") +
    `<path d="${mid.join("")}" fill="${world.pine}"/>` +
    hill((x) => y(x) + 14, 520, `url(#${ground})`) +
    `<path d="${front.join("")}" fill="${world.pine}"/>`
  );
}

/** A strip of grass along the top of the footer, which tiles sideways. 600 x 90. */
export function floorEdge(): string {
  const rand = rng(53);
  const blades: string[] = [];
  const dark: string[] = [];
  for (let x = 0; x <= 600; x += 7 + rand() * 6) blades.push(blade(x, 92, 28 + rand() * 40, (rand() - 0.5) * 22, 4 + rand() * 2));
  for (let x = 4; x <= 600; x += 11 + rand() * 8) dark.push(blade(x, 94, 22 + rand() * 30, (rand() - 0.5) * 20, 4 + rand() * 2));
  return `<path d="${blades.join("")}" fill="${world.pine}"/><path d="${dark.join("")}" fill="${world.floor}"/><rect y="60" width="600" height="40" fill="${world.floor}"/>`;
}

interface CapSpec {
  x: number;
  base: number;
  h: number;
  capW: number;
  capH: number;
  rot?: number;
  cap: string;
  rim: string;
  spots?: boolean;
}

/** One toadstool in the kit's inked style: a cream stem, a domed cap, and a few spots. */
function toadstool(s: CapSpec): string {
  const top = s.base - s.h;
  const capD = `M${n(-s.capW)} 0C${n(-s.capW)} ${n(-s.capH * 1.35)} ${n(s.capW)} ${n(-s.capH * 1.35)} ${n(s.capW)} 0Q0 ${n(s.capH * 0.38)} ${n(-s.capW)} 0Z`;
  const stem = `M${n(-s.capW * 0.2)} 0C${n(-s.capW * 0.24)} ${n(s.h * 0.5)} ${n(-s.capW * 0.34)} ${n(s.h * 0.8)} ${n(-s.capW * 0.38)} ${s.h}H${n(s.capW * 0.38)}C${n(s.capW * 0.34)} ${n(s.h * 0.8)} ${n(s.capW * 0.24)} ${n(s.h * 0.5)} ${n(s.capW * 0.2)} 0Z`;
  const spots = s.spots === false ? "" : `<g fill="${colors.cream}"><circle cx="${n(-s.capW * 0.45)}" cy="${n(-s.capH * 0.5)}" r="${n(s.capW * 0.12)}"/><circle cx="${n(s.capW * 0.08)}" cy="${n(-s.capH * 0.88)}" r="${n(s.capW * 0.14)}"/><circle cx="${n(s.capW * 0.52)}" cy="${n(-s.capH * 0.38)}" r="${n(s.capW * 0.1)}"/></g>`;
  return (
    `<g transform="translate(${n(s.x)} ${n(top)}) rotate(${s.rot ?? 0} 0 ${s.h})">` +
    `<path d="${stem}" fill="${colors.cream}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="${capD}" fill="${s.cap}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M${n(-s.capW * 0.86)} ${n(-s.capH * 0.1)}Q0 ${n(s.capH * 0.22)} ${n(s.capW * 0.86)} ${n(-s.capH * 0.1)}" fill="none" stroke="${s.rim}" stroke-width="2.4" stroke-linecap="round"/>` +
    spots +
    `</g>`
  );
}

/** The mossy mound and grass tufts every toadstool sits in, so it looks planted on the panel's edge. */
function mound(width: number): string {
  const half = width / 2;
  const rand = rng(width);
  const tufts: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = -half + 8 + (i * (width - 16)) / 8;
    tufts.push(blade(x, 4, 18 + rand() * 18, (rand() - 0.5) * 16, 2.6));
  }
  return `<path d="M${-half} 6Q${-half * 0.5} -14 0 -10Q${half * 0.55} -16 ${half} 6Z" fill="${world.leaf}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="${tufts.join("")}" fill="${world.canopy}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`;
}

/** Three toadstools of different sizes in moss. */
export function sproutCluster(): string {
  return (
    mound(240) +
    toadstool({ x: -2, base: 0, h: 70, capW: 46, capH: 36, cap: colors.copper, rim: colors.copperDeep }) +
    toadstool({ x: 68, base: 2, h: 44, capW: 29, capH: 23, rot: 8, cap: colors.gold, rim: colors.copper }) +
    toadstool({ x: -66, base: 2, h: 34, capW: 21, capH: 17, rot: -7, cap: colors.copperDeep, rim: colors.ink })
  );
}

/** One tall toadstool with a bud beside it. */
export function sproutTall(): string {
  return (
    mound(150) +
    toadstool({ x: 0, base: 0, h: 96, capW: 34, capH: 30, rot: 3, cap: colors.gold, rim: colors.copper }) +
    toadstool({ x: 48, base: 2, h: 26, capW: 15, capH: 13, rot: 12, cap: colors.copper, rim: colors.copperDeep, spots: false })
  );
}

/** A little ring of five small toadstools. */
export function sproutRing(): string {
  return (
    mound(200) +
    toadstool({ x: -70, base: 2, h: 28, capW: 18, capH: 14, rot: -10, cap: colors.champagne, rim: colors.copper }) +
    toadstool({ x: -32, base: 0, h: 42, capW: 24, capH: 19, rot: -4, cap: colors.copper, rim: colors.copperDeep }) +
    toadstool({ x: 8, base: 2, h: 30, capW: 19, capH: 15, rot: 3, cap: colors.champagne, rim: colors.copper }) +
    toadstool({ x: 44, base: 0, h: 48, capW: 26, capH: 21, rot: 7, cap: colors.gold, rim: colors.copper }) +
    toadstool({ x: 78, base: 3, h: 22, capW: 14, capH: 11, rot: 12, cap: colors.copper, rim: colors.copperDeep, spots: false })
  );
}

const veinLeaf = (len: number, w: number, fill: string, vein: string) => {
  const veins: string[] = [];
  for (let t = 0.2; t < 0.85; t += 0.16) {
    const x = len * t;
    const half = (w / 2) * (1 - Math.pow(2 * (t + 0.14) - 1, 2)) * 0.8;
    veins.push(`M${n(x)} 0L${n(len * (t + 0.14))} ${n(-half)}M${n(x)} 0L${n(len * (t + 0.14))} ${n(half)}`);
  }
  return (
    `<path d="M0 0Q${n(len / 2)} ${n(w)} ${n(len)} 0Q${n(len / 2)} ${n(-w)} 0 0Z" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M-6 0H${n(len)}${veins.join("")}" fill="none" stroke="${vein}" stroke-width="1.1" stroke-linecap="round"/>`
  );
};

/** A long green leaf. */
export const leafLong = () => veinLeaf(80, 26, world.leaf, world.floor);
/** A golden leaf. */
export const leafGold = () => veinLeaf(66, 24, colors.gold, colors.copperDeep);
/** A broad rounded leaf with a point. */
export function leafRound(): string {
  return (
    `<path d="M0 0C-26 -14 -34 -44 0 -72C34 -44 26 -14 0 0Z" fill="${world.canopy}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M0 8V-60M0 -18L-12 -32M0 -18L12 -32M0 -34L-9 -46M0 -34L9 -46" fill="none" stroke="${world.mist}" stroke-width="1.2" stroke-linecap="round"/>`
  );
}

export interface SceneAsset {
  name: string;
  use: string;
  draw: () => string;
  /** A layer keeps its exact canvas; small pieces are trimmed to what is painted. */
  canvas?: { width: number; height: number };
  budget: number;
  /** Counts towards the weight of the first paint of the home page (ADR 012 budget). */
  firstPaint?: boolean;
}

export const SCENE_ASSETS: SceneAsset[] = [
  { name: "far", use: "Farthest layer: pale hills and tree lines", draw: farLayer, canvas: { width: W, height: 600 }, budget: 12_000, firstPaint: true },
  { name: "mid", use: "Middle layer: trunks and a fern hill", draw: midLayer, canvas: { width: W, height: 900 }, budget: 22_000, firstPaint: true },
  { name: "near", use: "Nearest layer: grass, flowers and forest ground", draw: nearLayer, canvas: { width: W, height: 520 }, budget: 16_000, firstPaint: true },
  { name: "floor-edge", use: "Grass along the top of the footer (tiles sideways)", draw: floorEdge, canvas: { width: 600, height: 100 }, budget: 6_000 },
  { name: "sprout-cluster", use: "Toadstools that grow as you scroll", draw: sproutCluster, budget: 8_000 },
  { name: "sprout-tall", use: "Toadstools that grow as you scroll", draw: sproutTall, budget: 6_000 },
  { name: "sprout-ring", use: "Toadstools that grow as you scroll", draw: sproutRing, budget: 8_000 },
  { name: "leaf-long", use: "A leaf that drifts past", draw: leafLong, budget: 2_500 },
  { name: "leaf-gold", use: "A leaf that drifts past", draw: leafGold, budget: 2_500 },
  { name: "leaf-round", use: "A leaf that drifts past", draw: leafRound, budget: 2_500 },
];

export interface BuiltScene {
  name: string;
  svg: string;
  width: number;
  height: number;
}

export function buildSceneAsset(asset: SceneAsset): BuiltScene {
  resetIds();
  const inner = asset.draw();
  let x = 0;
  let y = 0;
  let width: number;
  let height: number;
  if (asset.canvas) {
    width = asset.canvas.width;
    height = asset.canvas.height;
  } else {
    const box = paintedBounds(inner);
    const pad = 4;
    x = Math.floor(box.x - pad);
    y = Math.floor(box.y - pad);
    width = Math.ceil(box.width + pad * 2);
    height = Math.ceil(box.height + pad * 2);
  }
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}">${inner}</svg>`;
  const svg = optimize(raw, { multipass: true, floatPrecision: 1, plugins: ["preset-default"] }).data;
  return { name: asset.name, svg, width, height };
}

export const buildScene = () => SCENE_ASSETS.map(buildSceneAsset);
