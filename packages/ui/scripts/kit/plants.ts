import type { Palette } from "../brand/palette";
import { colors, g, hatch, lens, mirror, n, path, quadAt, type Pt } from "./toolkit";

/** The small geometric moth (ADR 005). Centred on the origin, about 300 wide. */
export function mark(p: Palette): string {
  const half = g(
    g(path("M0 0Q75 52 150 0Q75 -52 0 0Z", { fill: p.forest }), { transform: "rotate(-36)" }) +
      g(path("M0 0Q59 46 118 0Q59 -46 0 0Z", { fill: p.copper }), { transform: "rotate(38)" }) +
      path("M5 -50C16 -78 34 -92 54 -96", { fill: "none", stroke: p.forest, "stroke-width": 5, "stroke-linecap": "round" }),
  );
  return mirror(half) + path("M0 0Q65 11 130 0Q65 -11 0 0Z", { fill: p.ink, transform: "translate(0 -64) rotate(90)" });
}

/** A garden spider hanging from a silk thread. The thread runs off the top, so it can hang from a heading. About 180 wide and 300 tall. */
export function spider(p: Palette): string {
  const legs: Pt[][] = [
    [[8, -20], [36, -54], [62, -62], [82, -44]],
    [[11, -14], [46, -32], [78, -36], [98, -14]],
    [[11, -8], [44, -2], [76, 8], [94, 34]],
    [[8, -2], [32, 22], [56, 52], [64, 84]],
  ];
  const widths = [3.6, 2.6, 1.6];
  const leg = (pts: Pt[]) =>
    pts
      .slice(0, 3)
      .map((a, i) => path(`M${a[0]} ${a[1]}L${pts[i + 1]![0]} ${pts[i + 1]![1]}`, { fill: "none", stroke: p.ink, "stroke-width": widths[i], "stroke-linecap": "round" }))
      .join("");
  const abdomenD = "M0 -2C22 -2 30 22 24 44C18 64 6 74 0 74C-6 74 -18 64 -24 44C-30 22 -22 -2 0 -2Z";
  const abdomen =
    path(abdomenD, { fill: p.copperDeep, stroke: p.ink, "stroke-width": 1.8 }) +
    hatch(abdomenD, { x: -30, y: -2, w: 60, h: 76 }, { angle: 65, gap: 3.4, width: 0.7, color: p.ink, opacity: 0.55 }) +
    `<g fill="${colors.champagne}"><ellipse cx="0" cy="14" rx="5" ry="8"/><ellipse cx="0" cy="38" rx="6" ry="7"/><circle cx="-12" cy="30" r="3"/><circle cx="12" cy="30" r="3"/><circle cx="0" cy="58" r="3.4"/></g>`;
  const front =
    `<ellipse cx="0" cy="-13" rx="13" ry="15" fill="${p.ink}"/>` +
    `<g fill="${p.paper}"><circle cx="-4" cy="-23" r="1.7"/><circle cx="4" cy="-23" r="1.7"/><circle cx="-7" cy="-19" r="1.2"/><circle cx="7" cy="-19" r="1.2"/></g>` +
    mirror(path("M4 -26Q10 -34 14 -32", { fill: "none", stroke: p.ink, "stroke-width": 2, "stroke-linecap": "round" }));
  return (
    path("M0 -220V-26", { fill: "none", stroke: p.ink, "stroke-width": 0.9 }) +
    mirror(legs.map(leg).join("")) +
    abdomen +
    front
  );
}

/** A small cluster of toadstools in moss. About 230 wide and 130 tall. */
export function mushrooms(p: Palette): string {
  const cap = (cx: number, base: number, h: number, capW: number, capH: number, rot: number) => {
    const top = base - h;
    const capD = `M${-capW} 0C${-capW} ${-capH * 1.35} ${capW} ${-capH * 1.35} ${capW} 0Q0 ${n(capH * 0.38)} ${-capW} 0Z`;
    const stem = `M${n(-capW * 0.22)} 0C${n(-capW * 0.26)} ${n(h * 0.5)} ${n(-capW * 0.34)} ${n(h * 0.8)} ${n(-capW * 0.4)} ${h}L${n(capW * 0.4)} ${h}C${n(capW * 0.34)} ${n(h * 0.8)} ${n(capW * 0.26)} ${n(h * 0.5)} ${n(capW * 0.22)} 0Z`;
    const gills: string[] = [];
    for (let i = -6; i <= 6; i++) gills.push(`M${n(i * capW * 0.15)} ${n(capH * 0.04)}L${n(i * capW * 0.15 * 0.55)} ${n(-capH * 0.02)}`);
    return (
      `<g transform="translate(${cx} ${top}) rotate(${rot} 0 ${h})">` +
      path(stem, { fill: p.paper, stroke: p.ink, "stroke-width": 1.8, "stroke-linejoin": "round" }) +
      hatch(stem, { x: -capW * 0.4, y: 0, w: capW * 0.8, h }, { angle: 90, gap: 3.2, width: 0.6, color: p.ink, opacity: 0.5 }) +
      path(gills.join(""), { stroke: p.ink, "stroke-width": 0.7 }) +
      path(capD, { fill: p.copper, stroke: p.ink, "stroke-width": 2, "stroke-linejoin": "round" }) +
      hatch(capD, { x: -capW, y: -capH * 1.35, w: capW * 2, h: capH * 1.8 }, { angle: 70, gap: 3.4, width: 0.8, color: p.copperDeep, opacity: 0.9 }) +
      `<g fill="${p.paper}" stroke="${p.ink}" stroke-width="0.8"><circle cx="${n(-capW * 0.42)}" cy="${n(-capH * 0.55)}" r="${n(capW * 0.11)}"/><circle cx="${n(capW * 0.1)}" cy="${n(-capH * 0.85)}" r="${n(capW * 0.13)}"/><circle cx="${n(capW * 0.5)}" cy="${n(-capH * 0.4)}" r="${n(capW * 0.09)}"/><circle cx="${n(-capW * 0.05)}" cy="${n(-capH * 0.3)}" r="${n(capW * 0.07)}"/></g>` +
      `</g>`
    );
  };
  const moss = `<path d="M-120 6C-90 -14 -50 -10 -20 -6C10 -16 60 -14 90 -6C110 -12 130 -4 140 6Z" fill="${colors.fern}" stroke="${p.ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const grass: string[] = [];
  for (let i = 0; i < 14; i++) {
    const x = -112 + i * 18;
    const lean = ((i * 37) % 11) - 5;
    grass.push(`M${x} 2Q${x + lean} ${-16 - (i % 4) * 5} ${x + lean * 2} ${-30 - (i % 3) * 7}`);
  }
  return (
    path(grass.join(""), { fill: "none", stroke: p.forest, "stroke-width": 1.6, "stroke-linecap": "round" }) +
    cap(0, 4, 74, 48, 38, 0) +
    cap(70, 4, 48, 30, 24, 9) +
    cap(-62, 4, 36, 22, 18, -8) +
    moss
  );
}

/** A gnarled branch with twigs, leaves and a bud, for page edges. About 300 wide and 190 tall. */
export function branch(p: Palette): string {
  const main = { a: [0, 0] as Pt, b: [110, -34] as Pt, c: [270, -66] as Pt };
  const twig = (t: number, dx: number, dy: number, bend: number, width: number) => {
    const { p: q } = quadAt(main.a, main.b, main.c, t);
    const end: Pt = [q[0] + dx, q[1] + dy];
    const d = `M${n(q[0])} ${n(q[1])}Q${n(q[0] + dx * 0.3)} ${n(q[1] + dy * 0.9 + bend)} ${n(end[0])} ${n(end[1])}`;
    return { d, end, width };
  };
  const twigs = [twig(0.32, 46, -84, -6, 5), twig(0.55, 34, 66, 8, 4.4), twig(0.8, 40, -62, -4, 3.6)];
  const leafAt = (x: number, y: number, rot: number, len: number) =>
    `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot})"><path d="${lens(len, len * 0.3)}" fill="${colors.fern}" stroke="${p.ink}" stroke-width="1.3" stroke-linejoin="round"/><path d="M0 0H${n(len)}" stroke="${p.ink}" stroke-width="0.8"/></g>`;
  const bark = (d: string, w: number) => path(d, { fill: "none", stroke: p.ink, "stroke-width": w + 4, "stroke-linecap": "round" }) + path(d, { fill: "none", stroke: p.copperDeep, "stroke-width": w, "stroke-linecap": "round" });
  const mainD = `M${main.a[0]} ${main.a[1]}Q${main.b[0]} ${main.b[1]} ${main.c[0]} ${main.c[1]}`;
  const grain = path(`M6 -2Q112 -34 262 -66M10 3Q112 -28 258 -60`, { fill: "none", stroke: p.ink, "stroke-width": 0.8, opacity: 0.6, "stroke-linecap": "round" });
  let out = "";
  for (const t of twigs) out += bark(t.d, t.width);
  out += bark(mainD, 9) + grain;
  for (const t of twigs) {
    out += leafAt(t.end[0], t.end[1], t.end[1] < 0 ? -64 : 62, 34) + leafAt(t.end[0], t.end[1], t.end[1] < 0 ? -10 : 18, 28);
  }
  const { p: mid, tan } = quadAt(main.a, main.b, main.c, 0.62);
  const ang = (Math.atan2(tan[1], tan[0]) * 180) / Math.PI;
  out += leafAt(mid[0], mid[1], ang - 50, 30) + leafAt(mid[0] - 30, mid[1] + 8, ang + 52, 28);
  out += leafAt(main.c[0], main.c[1], -34, 38) + `<ellipse cx="${main.c[0] + 12}" cy="${main.c[1] - 6}" rx="7" ry="10" transform="rotate(-24 ${main.c[0] + 12} ${main.c[1] - 6})" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.4"/>`;
  return out;
}

/** A curving sprig of leaves for edges and backgrounds. About 230 wide and 190 tall. */
export function sprig(p: Palette): string {
  const A: Pt = [0, 0];
  const B: Pt = [90, -6];
  const C: Pt = [190, -120];
  const leaf = (len: number, w: number) => {
    const veins: string[] = [];
    for (let t = 0.2; t < 0.85; t += 0.15) {
      const x = len * t;
      const t2 = t + 0.14;
      // The leaf outline is a quadratic curve, so its half-width at position t is (w / 2) * (1 - (2t - 1)^2).
      const half = (w / 2) * (1 - Math.pow(2 * t2 - 1, 2)) * 0.8;
      veins.push(`M${n(x)} 0L${n(len * t2)} ${n(-half)}M${n(x)} 0L${n(len * t2)} ${n(half)}`);
    }
    return path(lens(len, w), { fill: colors.fern, stroke: p.ink, "stroke-width": 1.5, "stroke-linejoin": "round" }) + path(`M0 0H${n(len)}${veins.join("")}`, { fill: "none", stroke: p.ink, "stroke-width": 0.8, "stroke-linecap": "round" });
  };
  const parts: string[] = [path(`M${A[0]} ${A[1]}Q${B[0]} ${B[1]} ${C[0]} ${C[1]}`, { fill: "none", stroke: p.ink, "stroke-width": 3, "stroke-linecap": "round" })];
  const count = 9;
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const { p: q, tan } = quadAt(A, B, C, t);
    const ang = (Math.atan2(tan[1], tan[0]) * 180) / Math.PI;
    const size = 62 * (1 - t * 0.55);
    const side = i % 2 === 0 ? 1 : -1;
    parts.push(`<g transform="translate(${n(q[0])} ${n(q[1])}) rotate(${n(ang + side * 52)})">${leaf(size, size * 0.3)}</g>`);
  }
  parts.push(`<g transform="translate(${C[0]} ${C[1]}) rotate(-52)">${leaf(40, 11)}</g>`);
  return parts.join("");
}

/** Three wildflowers on slender stems. About 230 wide and 250 tall. */
export function wildflowers(p: Palette): string {
  const flower = (cx: number, cy: number, r: number, petals: number, rot: number) => {
    const petal = (a: number) => `<path transform="rotate(${n(a)}) translate(${n(r * 0.2)} 0)" d="${lens(r, r * 0.24)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
    const ring: string[] = [];
    for (let i = 0; i < petals; i++) ring.push(petal(rot + (360 / petals) * i));
    const dots: string[] = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const d = r * 0.05 + r * 0.2 * Math.sqrt(i / 14);
      dots.push(`<circle cx="${n(Math.cos(a) * d)}" cy="${n(Math.sin(a) * d)}" r="${n(r * 0.025)}" fill="${p.ink}"/>`);
    }
    return `<g transform="translate(${cx} ${cy})">${ring.join("")}<circle r="${n(r * 0.25)}" fill="${p.gold}" stroke="${p.ink}" stroke-width="1.4"/>${dots.join("")}</g>`;
  };
  const stem = (pts: [Pt, Pt, Pt]) => path(`M${pts[0][0]} ${pts[0][1]}Q${pts[1][0]} ${pts[1][1]} ${pts[2][0]} ${pts[2][1]}`, { fill: "none", stroke: p.forest, "stroke-width": 2.6, "stroke-linecap": "round" });
  const leaf = (x: number, y: number, rot: number, len: number) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="${lens(len, len * 0.22)}" fill="${colors.fern}" stroke="${p.ink}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 0H${len}" stroke="${p.ink}" stroke-width="0.7"/></g>`;
  const s1: [Pt, Pt, Pt] = [[0, 0], [-6, -90], [-46, -150]];
  const s2: [Pt, Pt, Pt] = [[0, 0], [10, -110], [8, -196]];
  const s3: [Pt, Pt, Pt] = [[0, 0], [24, -70], [58, -140]];
  const at = (s: [Pt, Pt, Pt], t: number) => quadAt(s[0], s[1], s[2], t).p;
  const attach = (s: [Pt, Pt, Pt], t: number, rot: number, len: number) => {
    const [x, y] = at(s, t);
    return leaf(n(x), n(y), rot, len);
  };
  return (
    stem(s1) +
    stem(s2) +
    stem(s3) +
    attach(s1, 0.22, -150, 44) +
    attach(s2, 0.3, -35, 40) +
    attach(s3, 0.25, -30, 38) +
    attach(s2, 0.18, -145, 36) +
    flower(-46, -150, 30, 12, 4) +
    flower(8, -196, 36, 14, 10) +
    flower(58, -140, 26, 11, -6)
  );
}

/** A flourish for dividing sections: a small diamond with a leafy vine to each side. About 560 wide. */
export function divider(p: Palette): string {
  const wave: string[] = ["M16 0"];
  const leaves: string[] = [];
  let x = 16;
  let up = -1;
  for (let i = 0; i < 7; i++) {
    const step = 62 - i * 4;
    wave.push(`Q${x + step / 2} ${up * 13} ${x + step} 0`);
    leaves.push(`<g transform="translate(${x + step / 2} ${up * 6.5}) rotate(${up * -38})"><path d="${lens(15 - i, 3.8 - i * 0.2)}" fill="${p.forest}" stroke="${p.ink}" stroke-width="0.9" stroke-linejoin="round"/></g>`);
    x += step;
    up = -up;
  }
  const half =
    path(wave.join(""), { fill: "none", stroke: p.ink, "stroke-width": 1.6, "stroke-linecap": "round" }) +
    leaves.join("") +
    `<circle cx="${x + 6}" cy="0" r="2.4" fill="${p.copper}"/>`;
  const centre =
    `<path d="M-13 0L0 -9L13 0L0 9Z" fill="${p.copper}" stroke="${p.ink}" stroke-width="1.4" stroke-linejoin="round"/>` + `<circle r="2.6" fill="${p.paper}"/>`;
  return mirror(half) + centre;
}
