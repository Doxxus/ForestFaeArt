import { colors } from "../../src/tokens";
import type { Palette } from "../brand/palette";
import { colour } from "../brand/palette";

export type Pt = [number, number];
export type Cubic = [Pt, Pt, Pt, Pt];

export const n = (v: number) => Math.round(v * 100) / 100;

let counter = 0;
/** Unique ids so two clip paths in one file never collide. SVGO shortens them afterwards. */
export const uid = (prefix: string) => `${prefix}${++counter}`;
export const resetIds = () => {
  counter = 0;
};

type Attrs = Record<string, string | number | undefined>;
export const attrs = (o: Attrs) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === "number" ? n(v) : v}"`)
    .join(" ");

export const path = (d: string, o: Attrs = {}) => `<path d="${d}" ${attrs(o)}/>`;
export const g = (content: string, o: Attrs = {}) => `<g ${attrs(o)}>${content}</g>`;
export const mirror = (content: string) => `${content}<g transform="scale(-1 1)">${content}</g>`;

/** A lens (leaf) shape from the origin along +x. */
export const lens = (len: number, w: number) => `M0 0Q${n(len / 2)} ${n(w)} ${n(len)} 0Q${n(len / 2)} ${n(-w)} 0 0Z`;

export const cubicAt = ([a, b, c, d]: Cubic, t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
};

export const quadAt = (a: Pt, b: Pt, c: Pt, t: number): { p: Pt; tan: Pt } => {
  const u = 1 - t;
  return {
    p: [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]],
    tan: [2 * u * (b[0] - a[0]) + 2 * t * (c[0] - b[0]), 2 * u * (b[1] - a[1]) + 2 * t * (c[1] - b[1])],
  };
};

/** SVG path data for a chain of cubic segments that share end points. */
export const cubicPath = (segs: Cubic[], close = true) =>
  `M${segs[0]![0][0]} ${segs[0]![0][1]}` + segs.map(([, b, c, d]) => `C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}`).join("") + (close ? "Z" : "");

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Parallel hatch lines clipped to a shape: the engraver's way of shading. Lines are drawn in the shape's own
 * coordinates, so call it inside the same transform as the shape.
 */
export function hatch(region: string, box: Box, o: { angle: number; gap: number; width: number; color: string; opacity?: number }): string {
  const id = uid("c");
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const diag = Math.hypot(box.w, box.h) / 2 + 2;
  const lines: string[] = [];
  for (let y = -diag; y <= diag; y += o.gap) lines.push(`M${n(cx - diag)} ${n(cy + y)}H${n(cx + diag)}`);
  return (
    `<clipPath id="${id}"><path d="${region}"/></clipPath>` +
    `<g clip-path="url(#${id})"><g transform="rotate(${o.angle} ${n(cx)} ${n(cy)})">${path(lines.join(""), { fill: "none", stroke: o.color, "stroke-width": o.width, opacity: o.opacity, "stroke-linecap": "round" })}</g></g>`
  );
}

/** Lines from one point out to evenly spaced places on an edge curve: wing veins. Clip them to the wing. */
export function fan(anchor: Pt, edge: Cubic[], o: { from?: number; to?: number; steps: number; width: number; color: string; opacity?: number }): string {
  const out: string[] = [];
  const from = o.from ?? 0;
  const to = o.to ?? 1;
  for (const seg of edge) {
    for (let i = 0; i <= o.steps; i++) {
      const q = cubicAt(seg, from + ((to - from) * i) / o.steps);
      out.push(`M${anchor[0]} ${anchor[1]}L${n(q[0])} ${n(q[1])}`);
    }
  }
  return path(out.join(""), { fill: "none", stroke: o.color, "stroke-width": o.width, opacity: o.opacity, "stroke-linecap": "round" });
}

/** Small marks drawn from an edge towards an anchor, like the fine ticks along an engraved wing margin. */
export function ticks(anchor: Pt, edge: Cubic[], o: { every: number; min: number; max: number; width: number; color: string }): string {
  const out: string[] = [];
  for (const seg of edge) {
    for (let t = 0.03; t < 1; t += o.every) {
      const q = cubicAt(seg, t);
      const dx = anchor[0] - q[0];
      const dy = anchor[1] - q[1];
      const d = Math.hypot(dx, dy) || 1;
      const len = o.min + (o.max - o.min) * Math.abs(Math.sin(t * 9));
      out.push(`M${n(q[0])} ${n(q[1])}L${n(q[0] + (dx / d) * len)} ${n(q[1] + (dy / d) * len)}`);
    }
  }
  return path(out.join(""), { fill: "none", stroke: o.color, "stroke-width": o.width, "stroke-linecap": "round" });
}

/** Dots placed along an edge curve. */
export function dotsAlong(edge: Cubic[], o: { every: number; r: number; fill: string; inset?: Pt; from?: number; to?: number }): string {
  const out: string[] = [];
  for (const seg of edge) {
    for (let t = o.from ?? 0.06; t <= (o.to ?? 0.94); t += o.every) {
      const q = cubicAt(seg, t);
      out.push(`<circle cx="${n(q[0] + (o.inset?.[0] ?? 0))}" cy="${n(q[1] + (o.inset?.[1] ?? 0))}" r="${n(o.r * (0.75 + 0.5 * Math.abs(Math.sin(t * 7))))}" fill="${o.fill}"/>`);
    }
  }
  return out.join("");
}

// ---- palettes the kit is drawn in ----

/** Dark lines and cream paper: for the cream and sage grounds of the public site. */
export const kitColour: Palette = { ...colour, ground: "transparent" };
/** Green line work, for ferns and leaves that should sit softly behind content. */
export const kitGreen: Palette = { ...colour, ground: "transparent", ink: colors.forest };
/** Light lines for dark grounds, such as the footer. */
export const kitLight: Palette = { ...colour, ground: "transparent", ink: colors.champagne, paper: colors.forest, forest: colors.champagne };

export { colors };
