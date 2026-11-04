import type { Palette } from "../brand/palette";
import { colors, cubicPath, dotsAlong, fan, g, hatch, mirror, n, path, uid, type Cubic, type Pt } from "./toolkit";

const clipOf = (d: string) => {
  const id = uid("w");
  return { id, def: `<clipPath id="${id}"><path d="${d}"/></clipPath>` };
};

/** A wing clipped contents helper: draws `inside` only within the wing outline. */
const within = (d: string, inside: string) => {
  const c = clipOf(d);
  return `${c.def}<g clip-path="url(#${c.id})">${inside}</g>`;
};

const body = (p: Palette, o: { thorax: number; abdomen: number; headY: number }) =>
  `<ellipse cx="0" cy="${o.headY + 20}" rx="6.4" ry="${o.thorax}" fill="${p.ink}"/>` +
  `<ellipse cx="0" cy="${o.headY + 20 + o.thorax + o.abdomen * 0.6}" rx="4.4" ry="${o.abdomen}" fill="${p.ink}"/>` +
  `<circle cx="0" cy="${o.headY}" r="5.6" fill="${p.ink}"/>` +
  `<circle cx="-2.4" cy="${o.headY - 1}" r="1.2" fill="${p.paper}"/><circle cx="2.4" cy="${o.headY - 1}" r="1.2" fill="${p.paper}"/>`;

const antennae = (p: Palette, y: number, reach: number) =>
  mirror(
    path(`M2 ${y}C8 ${y - 22} 20 ${y - 36} ${reach} ${y - 46}`, { fill: "none", stroke: p.ink, "stroke-width": 1.6, "stroke-linecap": "round" }) +
      `<ellipse cx="${reach + 2}" cy="${y - 47}" rx="4" ry="1.9" transform="rotate(-28 ${reach + 2} ${y - 47})" fill="${p.ink}"/>`,
  );

/** A morpho-style butterfly: deep green wings with a dark border of pale dots. Origin at the body centre, about 280 wide. */
export function morpho(p: Palette): string {
  const FW: Cubic[] = [
    [[4, -10], [34, -52], [92, -92], [138, -86]],
    [[138, -86], [142, -62], [132, -34], [112, -14]],
    [[112, -14], [84, 6], [44, 8], [6, 4]],
  ];
  const HW: Cubic[] = [
    [[6, 0], [48, -6], [98, 6], [116, 36]],
    [[116, 36], [128, 62], [108, 92], [78, 90]],
    [[78, 90], [48, 88], [22, 66], [6, 38]],
  ];
  const fwD = cubicPath(FW);
  const hwD = cubicPath(HW);
  const sheen = (d: string, sx: number, sy: number) => `<g transform="translate(${sx} ${sy})">${path(d, { fill: colors.fern, opacity: 0.55 })}</g>`;
  const wing = (d: string, segs: Cubic[], anchor: Pt, margin: Cubic[], glow: string) =>
    path(d, { fill: p.forest }) +
    within(
      d,
      sheen(glow, 0, 0) +
        fan(anchor, segs.slice(1), { steps: 7, width: 0.8, color: colors.champagne, opacity: 0.4 }) +
        path(cubicPath(margin, false), { fill: "none", stroke: p.ink, "stroke-width": 9, "stroke-linecap": "round" }),
    ) +
    dotsAlong(margin, { every: 0.12, r: 1.7, fill: p.paper, inset: [-5, -1] }) +
    path(d, { fill: "none", stroke: p.ink, "stroke-width": 2, "stroke-linejoin": "round" });

  const halfWings =
    wing(hwD, HW, [8, 8], [HW[1]!], "M8 6C46 2 88 12 104 36C108 52 92 70 70 72C44 70 24 54 8 34Z") +
    wing(fwD, FW, [6, -2], [FW[1]!], "M6 -4C40 -40 92 -66 122 -62C124 -46 110 -26 92 -12C68 2 34 4 6 4Z");
  const veinsInk = path("M6 -2C40 -30 80 -54 120 -76M6 0C50 -14 90 -30 130 -44", { fill: "none", stroke: p.ink, "stroke-width": 0.9, opacity: 0.55 });

  return mirror(g(halfWings + veinsInk)) + body(p, { thorax: 16, abdomen: 34, headY: -22 }) + antennae(p, -26, 36);
}

/** A swallowtail: cream wings with bold dark stripes, tails and a copper eyespot. About 300 tall. */
export function swallowtail(p: Palette): string {
  const FW: Cubic[] = [
    [[4, -8], [40, -60], [96, -98], [142, -96]],
    [[142, -96], [146, -70], [126, -30], [104, -6]],
    [[104, -6], [70, 6], [34, 6], [6, 4]],
  ];
  const HW: Cubic[] = [
    [[6, 2], [46, -2], [92, 10], [108, 38]],
    [[108, 38], [118, 60], [112, 84], [106, 104]],
    [[106, 104], [110, 124], [104, 142], [92, 150]],
    [[92, 150], [88, 130], [84, 112], [76, 102]],
    [[76, 102], [52, 94], [24, 70], [6, 40]],
  ];
  const fwD = cubicPath(FW);
  const hwD = cubicPath(HW);

  const forewing =
    path(fwD, { fill: p.paper }) +
    within(
      fwD,
      fan([6, -2], [FW[0]!, FW[1]!], { from: 0.2, to: 0.95, steps: 5, width: 5, color: p.ink }) +
        path(cubicPath([FW[1]!], false), { fill: "none", stroke: p.ink, "stroke-width": 12, "stroke-linecap": "round" }) +
        path("M6 -4C40 -30 80 -50 118 -62", { fill: "none", stroke: p.ink, "stroke-width": 5, "stroke-linecap": "round" }),
    ) +
    dotsAlong([FW[1]!], { every: 0.16, r: 2.2, fill: p.gold, inset: [-6, 0], from: 0.1 }) +
    path(fwD, { fill: "none", stroke: p.ink, "stroke-width": 2.2, "stroke-linejoin": "round" });

  const hindwing =
    path(hwD, { fill: p.paper }) +
    within(
      hwD,
      fan([8, 10], [HW[0]!, HW[1]!, HW[4]!], { from: 0.2, to: 0.95, steps: 3, width: 4.4, color: p.ink }) +
        path(cubicPath([HW[1]!, HW[2]!], false), { fill: "none", stroke: p.ink, "stroke-width": 12, "stroke-linecap": "round" }) +
        `<ellipse cx="92" cy="96" rx="12" ry="9" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.6"/><circle cx="94" cy="96" r="4" fill="${p.ink}"/>` +
        dotsAlong([HW[1]!], { every: 0.2, r: 2, fill: colors.forest, inset: [-8, 0], from: 0.2, to: 0.8 }),
    ) +
    path(hwD, { fill: "none", stroke: p.ink, "stroke-width": 2.2, "stroke-linejoin": "round" });

  return mirror(g(hindwing + forewing)) + body(p, { thorax: 15, abdomen: 38, headY: -22 }) + antennae(p, -26, 38);
}

/** A dragonfly seen from above, four glassy wings spread. About 330 wide and 290 tall. */
export function dragonfly(p: Palette): string {
  const wingD = (len: number, w: number) => `M0 0C${n(len * 0.3)} ${-w} ${n(len * 0.82)} ${n(-w * 1.05)} ${len} ${n(-w * 0.2)}C${n(len * 0.84)} ${n(w * 0.7)} ${n(len * 0.3)} ${n(w * 0.8)} 0 0Z`;
  const wing = (len: number, w: number, x: number, y: number, rot: number) => {
    const d = wingD(len, w);
    const box = { x: 0, y: -w * 1.1, w: len, h: w * 2 };
    return (
      `<g transform="translate(${x} ${y}) rotate(${rot})">` +
      path(d, { fill: p.paper, opacity: 0.55 }) +
      hatch(d, box, { angle: 0, gap: 6, width: 0.6, color: p.ink, opacity: 0.8 }) +
      hatch(d, box, { angle: 90, gap: 5.5, width: 0.45, color: p.ink, opacity: 0.7 }) +
      path(d, { fill: "none", stroke: p.ink, "stroke-width": 1.5, "stroke-linejoin": "round" }) +
      path(`M${n(len * 0.82)} ${n(-w * 0.5)}h${n(len * 0.1)}v${n(w * 0.28)}h${n(-len * 0.1)}z`, { fill: p.ink }) +
      `</g>`
    );
  };
  const side = wing(150, 22, 8, -92, -9) + wing(142, 30, 8, -74, 9);
  let abdomen = "";
  for (let i = 0; i < 11; i++) {
    const y0 = -62 + i * 17.5;
    const w0 = 6.4 - i * 0.3;
    const w1 = 6.4 - (i + 1) * 0.3;
    abdomen +=
      path(`M${-w0} ${y0}L${w0} ${y0}L${w1} ${y0 + 17.5}L${-w1} ${y0 + 17.5}Z`, { fill: p.ink, stroke: p.paper, "stroke-width": 0.9 }) +
      (i % 2 === 0 ? path(`M${-w0 + 1.5} ${y0 + 3}h${(w0 - 1.5) * 2}`, { stroke: p.copper, "stroke-width": 2, "stroke-linecap": "round" }) : "");
  }
  const legs = mirror(path("M6 -96l16 10l8 18M5 -88l20 2l12 12M4 -80l16 12l4 18", { fill: "none", stroke: p.ink, "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  const head =
    `<ellipse cx="0" cy="-90" rx="12" ry="20" fill="${p.ink}"/>` +
    `<circle cx="-9" cy="-118" r="10" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.6"/><circle cx="9" cy="-118" r="10" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.6"/>` +
    `<circle cx="-11" cy="-121" r="3" fill="${p.gold}"/><circle cx="7" cy="-121" r="3" fill="${p.gold}"/>` +
    `<rect x="-6" y="-110" width="12" height="7" rx="3" fill="${p.ink}"/>`;
  return legs + mirror(side) + abdomen + head;
}

/** A cicada from above: wide head, bold shoulders and long veined wings. About 200 wide and 250 tall. */
export function cicada(p: Palette): string {
  const FW: Cubic[] = [
    [[12, -34], [44, -50], [68, -12], [68, 48]],
    [[68, 48], [68, 112], [52, 164], [36, 182]],
    [[36, 182], [26, 136], [16, 40], [12, -34]],
  ];
  const HW: Cubic[] = [
    [[12, -26], [34, -34], [52, -6], [54, 40]],
    [[54, 40], [54, 86], [44, 124], [32, 138]],
    [[32, 138], [24, 104], [16, 46], [12, -26]],
  ];
  const wing = (segs: Cubic[], anchor: Pt, steps: number) => {
    const d = cubicPath(segs);
    return (
      path(d, { fill: p.paper, opacity: 0.6 }) +
      within(d, fan(anchor, [segs[1]!], { steps, width: 0.7, color: p.ink, opacity: 0.8 }) + hatch(d, { x: 0, y: -60, w: 110, h: 230 }, { angle: 62, gap: 7, width: 0.4, color: p.ink, opacity: 0.55 })) +
      path(d, { fill: "none", stroke: p.ink, "stroke-width": 1.6, "stroke-linejoin": "round" }) +
      path(cubicPath([segs[0]!], false), { fill: "none", stroke: p.ink, "stroke-width": 3.6, "stroke-linecap": "round" })
    );
  };
  const wings = mirror(wing(HW, [10, -22], 9) + wing(FW, [10, -30], 11));
  let abdomen = `<ellipse cx="0" cy="44" rx="17" ry="48" fill="${p.ink}"/>`;
  for (let y = 8; y < 90; y += 7) abdomen += path(`M${n(-16 + Math.abs(y - 44) * 0.05)} ${y}Q0 ${y + 3.5} ${n(16 - Math.abs(y - 44) * 0.05)} ${y}`, { fill: "none", stroke: p.paper, "stroke-width": 0.8 });
  const thorax =
    path("M-27 -62L27 -62L32 -34L-32 -34Z", { fill: p.ink, "stroke-linejoin": "round" }) +
    `<ellipse cx="0" cy="-12" rx="21" ry="24" fill="${p.ink}"/>` +
    path("M-12 -30L0 -8L12 -30M-9 -4L0 14L9 -4", { fill: "none", stroke: p.copper, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }) +
    path("M-27 -50H27", { stroke: p.paper, "stroke-width": 0.8 });
  const head =
    `<ellipse cx="0" cy="-70" rx="22" ry="11" fill="${p.ink}"/>` +
    `<circle cx="-25" cy="-70" r="9.5" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.6"/><circle cx="25" cy="-70" r="9.5" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.6"/>` +
    `<circle cx="-27" cy="-73" r="2.8" fill="${p.gold}"/><circle cx="23" cy="-73" r="2.8" fill="${p.gold}"/>` +
    `<circle cx="-5" cy="-72" r="1.8" fill="${p.gold}"/><circle cx="5" cy="-72" r="1.8" fill="${p.gold}"/><circle cx="0" cy="-67" r="1.8" fill="${p.gold}"/>`;
  return wings + abdomen + thorax + head;
}
