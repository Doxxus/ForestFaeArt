import type { Palette } from "../brand/palette";
import { colors, cubicAt, cubicPath, fan, g, hatch, mirror, n, path, quadAt, uid, type Cubic, type Pt } from "./toolkit";

const within = (d: string, inside: string) => {
  const id = uid("w");
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${inside}</g>`;
};

/** An atlas moth: rust wings with clear triangular windows and a hooked tip like a snake's head. About 290 wide and 200 tall. */
export function atlasMoth(p: Palette): string {
  const FW: Cubic[] = [
    [[6, -12], [40, -62], [94, -96], [140, -86]],
    [[140, -86], [150, -68], [132, -36], [108, -16]],
    [[108, -16], [74, 0], [34, 6], [6, 4]],
  ];
  const HW: Cubic[] = [
    [[6, 0], [56, -4], [106, 14], [118, 50]],
    [[118, 50], [124, 80], [100, 106], [68, 100]],
    [[68, 100], [38, 94], [16, 66], [6, 34]],
  ];
  const wing = (segs: Cubic[], anchor: Pt, window: string, bandEdge: Cubic[]) => {
    const d = cubicPath(segs);
    return (
      path(d, { fill: p.copperDeep }) +
      within(
        d,
        path(d, { fill: p.copper, opacity: 0.55, transform: "translate(-6 -2) scale(0.9)" }) +
          fan(anchor, [segs[1]!], { steps: 8, width: 0.8, color: p.ink, opacity: 0.45 }) +
          path(cubicPath(bandEdge, false), { fill: "none", stroke: p.ink, "stroke-width": 8, "stroke-linecap": "round" }) +
          path(cubicPath(bandEdge, false), { fill: "none", stroke: colors.champagne, "stroke-width": 1.6, transform: "translate(-6 0)", "stroke-dasharray": "5 4" }),
      ) +
      path(window, { fill: p.paper, stroke: p.ink, "stroke-width": 1.4, "stroke-linejoin": "round" }) +
      path(d, { fill: "none", stroke: p.ink, "stroke-width": 2, "stroke-linejoin": "round" })
    );
  };
  const hook = `<circle cx="132" cy="-80" r="2.6" fill="${p.paper}"/><circle cx="132" cy="-80" r="1.1" fill="${p.ink}"/>`;
  const wings =
    wing(HW, [8, 10], "M36 20L64 12L56 42Z", [HW[1]!]) +
    wing(FW, [6, -6], "M48 -30L78 -46L68 -12Z", [FW[1]!]) +
    hook;

  const A: Pt = [3, -35];
  const B: Pt = [14, -62];
  const C: Pt = [34, -74];
  const barbs: string[] = [];
  for (let t = 0.1; t < 0.97; t += 0.07) {
    const { p: q, tan } = quadAt(A, B, C, t);
    const d = Math.hypot(tan[0], tan[1]);
    const len = 10 * (1 - t * 0.5);
    barbs.push(`M${n(q[0] + (tan[1] / d) * len)} ${n(q[1] - (tan[0] / d) * len)}L${n(q[0] - (tan[1] / d) * len)} ${n(q[1] + (tan[0] / d) * len)}`);
  }
  const antenna =
    path(`M${A[0]} ${A[1]}Q${B[0]} ${B[1]} ${C[0]} ${C[1]}`, { fill: "none", stroke: p.ink, "stroke-width": 1.5, "stroke-linecap": "round" }) +
    path(barbs.join(""), { fill: "none", stroke: p.ink, "stroke-width": 0.9, "stroke-linecap": "round" });

  const segs: string[] = [];
  for (let y = -6; y <= 40; y += 4.6) segs.push(`M-7 ${y}Q0 ${n(y + 2.6)} 7 ${y}`);
  const body =
    `<ellipse cx="0" cy="12" rx="7.6" ry="32" fill="${p.ink}"/>` +
    path(segs.join(""), { fill: "none", stroke: p.copper, "stroke-width": 0.8 }) +
    `<ellipse cx="0" cy="-14" rx="11" ry="14" fill="${p.ink}"/><circle cx="0" cy="-32" r="6.8" fill="${p.ink}"/>` +
    `<circle cx="-3.2" cy="-33" r="1.5" fill="${p.paper}"/><circle cx="3.2" cy="-33" r="1.5" fill="${p.paper}"/>`;
  return mirror(g(wings + antenna)) + body;
}

/** A scarab beetle from above: domed green wing cases with fine ribbing. About 190 wide and 230 tall. */
export function scarab(p: Palette): string {
  const elytraD = "M2 -10C40 -12 56 28 52 66C48 104 24 126 2 128Z";
  const pronD = "M-38 -14C-34 -40 -18 -50 0 -50C18 -50 34 -40 38 -14C30 -6 14 -2 0 -2C-14 -2 -30 -6 -38 -14Z";
  const half = () =>
    path(elytraD, { fill: p.forest, stroke: p.ink, "stroke-width": 2.4, "stroke-linejoin": "round" }) +
    hatch(elytraD, { x: 0, y: -12, w: 56, h: 142 }, { angle: 90, gap: 4.2, width: 0.9, color: p.ink, opacity: 0.55 }) +
    path("M16 8C34 20 42 50 36 82", { fill: "none", stroke: colors.champagne, "stroke-width": 3.2, "stroke-linecap": "round", opacity: 0.55 });
  const leg = (pts: Pt[]) =>
    pts
      .slice(0, -1)
      .map((a, i) => path(`M${a[0]} ${a[1]}L${pts[i + 1]![0]} ${pts[i + 1]![1]}`, { fill: "none", stroke: p.ink, "stroke-width": 4.6 - i * 1.2, "stroke-linecap": "round", "stroke-linejoin": "round" }))
      .join("");
  const legs = mirror(leg([[34, -26], [60, -40], [84, -30], [92, -12]]) + leg([[44, 18], [76, 12], [98, 30], [102, 52]]) + leg([[40, 74], [66, 92], [84, 118], [80, 142]]));
  const head = `<path d="M-20 -48C-20 -76 20 -76 20 -48Z" fill="${p.ink}"/>` + mirror(path("M6 -70L12 -82", { stroke: p.ink, "stroke-width": 2.4, "stroke-linecap": "round" })) + `<circle cx="-12" cy="-60" r="2.2" fill="${p.paper}"/><circle cx="12" cy="-60" r="2.2" fill="${p.paper}"/>`;
  const pron = path(pronD, { fill: p.copperDeep, stroke: p.ink, "stroke-width": 2.4, "stroke-linejoin": "round" }) + hatch(pronD, { x: -40, y: -50, w: 80, h: 50 }, { angle: 12, gap: 3.4, width: 0.7, color: p.ink, opacity: 0.5 });
  return legs + head + g(half()) + g(half(), { transform: "scale(-1 1)" }) + pron;
}

/** A centipede winding across the page, one pair of legs to a segment. About 330 wide and 190 tall. */
export function centipede(p: Palette): string {
  const spine: Cubic = [[-150, 50], [-70, -100], [60, 110], [150, -50]];
  const count = 22;
  let parts = "";
  const legsPath: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = 0.04 + (i / (count - 1)) * 0.9;
    const q = cubicAt(spine, t);
    const a = cubicAt(spine, Math.min(1, t + 0.01));
    const b = cubicAt(spine, Math.max(0, t - 0.01));
    const ang = (Math.atan2(a[1] - b[1], a[0] - b[0]) * 180) / Math.PI;
    const size = 11 - (i / count) * 4.5;
    const nx = -(a[1] - b[1]);
    const ny = a[0] - b[0];
    const d = Math.hypot(nx, ny) || 1;
    const reach = 22 - (i / count) * 8 + (i === count - 1 ? 8 : 0);
    for (const side of [-1, 1]) {
      const sx = q[0] + (nx / d) * size * 0.4 * side;
      const sy = q[1] + (ny / d) * size * 0.4 * side;
      const mx = sx + (nx / d) * reach * 0.6 * side + (a[0] - b[0]) / d * -5;
      const my = sy + (ny / d) * reach * 0.6 * side + (a[1] - b[1]) / d * -5;
      legsPath.push(`M${n(sx)} ${n(sy)}L${n(mx)} ${n(my)}L${n(mx + (nx / d) * reach * 0.5 * side + ((a[0] - b[0]) / d) * 7)} ${n(my + (ny / d) * reach * 0.5 * side + ((a[1] - b[1]) / d) * 7)}`);
    }
    parts += `<g transform="translate(${n(q[0])} ${n(q[1])}) rotate(${n(ang)})"><ellipse rx="${n(size * 0.62)}" ry="${n(size)}" fill="${i % 2 ? p.copper : p.copperDeep}" stroke="${p.ink}" stroke-width="1.6"/></g>`;
  }
  const h = cubicAt(spine, 0.02);
  const headAng = (Math.atan2(cubicAt(spine, 0.03)[1] - h[1], cubicAt(spine, 0.03)[0] - h[0]) * 180) / Math.PI;
  const head =
    `<g transform="translate(${n(h[0])} ${n(h[1])}) rotate(${n(headAng + 180)})"><ellipse rx="12" ry="14" fill="${p.ink}"/>` +
    path("M6 -6C20 -10 28 -4 36 -12M6 6C20 10 28 4 36 12", { fill: "none", stroke: p.ink, "stroke-width": 1.6, "stroke-linecap": "round" }) +
    `<circle cx="-4" cy="-6" r="1.8" fill="${p.paper}"/><circle cx="-4" cy="6" r="1.8" fill="${p.paper}"/></g>`;
  return path(legsPath.join(""), { fill: "none", stroke: p.ink, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }) + parts + head;
}
