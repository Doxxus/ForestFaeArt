import { PANEL_OPACITY, world } from "@ffa/ui";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/world.css", import.meta.url), "utf8");

interface Declaration {
  property: string;
  value: string;
  /** The at-rules and selectors this declaration sits inside, outermost first. */
  within: string[];
}

/** A small reader for the one stylesheet: enough to know which rules each declaration sits inside. */
function declarations(source: string): Declaration[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Declaration[] = [];
  const stack: string[] = [];
  let buffer = "";
  const flush = () => {
    const [property, ...rest] = buffer.split(":");
    if (property?.trim() && rest.length) out.push({ property: property.trim(), value: rest.join(":").trim(), within: [...stack] });
    buffer = "";
  };
  for (const ch of text) {
    if (ch === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") flush();
    else buffer += ch;
  }
  return out;
}

const all = declarations(css);

describe("the green world's motion (ADR 012)", () => {
  it("only uses scroll-driven animation where the browser supports it and motion is welcome", () => {
    const scroll = all.filter((d) => d.property === "animation-timeline" || /\b(scroll|view)\(/.test(d.value));
    expect(scroll.length).toBeGreaterThan(0);
    for (const d of scroll) {
      expect(d.within.some((w) => /^@supports \(animation-timeline: (scroll|view)\(\)\)$/.test(w)), `${d.property}: ${d.value} is not inside @supports`).toBe(true);
      expect(d.within, `${d.property}: ${d.value} is not inside the no-preference media query`).toContain("@media (prefers-reduced-motion: no-preference)");
    }
  });

  it("only animates properties that stay on the compositor", () => {
    const allowed = new Set(["transform", "translate", "scale", "rotate", "opacity"]);
    const keyframes = all.filter((d) => d.within.some((w) => w.startsWith("@keyframes")));
    expect(keyframes.length).toBeGreaterThan(0);
    for (const d of keyframes) expect(allowed.has(d.property), `${d.property} is animated in ${d.within.join(" > ")}`).toBe(true);
  });

  it("starts every infinite animation only when motion is welcome", () => {
    for (const d of all.filter((x) => x.property === "animation" && /infinite/.test(x.value) && !x.within.some((w) => w.startsWith("@keyframes")))) {
      expect(d.within, `${d.value} runs even with reduced motion`).toContain("@media (prefers-reduced-motion: no-preference)");
    }
  });
});

describe("the green world's look", () => {
  it("repeats the world palette in the site's variables", () => {
    const names: Record<string, string> = { sky: "sky", mist: "mist", hillFar: "hill-far", meadow: "meadow", hillMid: "hill-mid", leaf: "leaf", canopy: "canopy", pine: "pine", bark: "bark", floor: "floor" };
    for (const [token, hex] of Object.entries(world)) {
      expect(css, token).toContain(`--world-${names[token]}: ${hex};`);
    }
  });

  it("keeps the reading panels as opaque as the contrast test assumes", () => {
    const panel = all.find((d) => d.property === "background" && d.within.join() === ".panel")!;
    expect(panel.value).toBe(`rgb(244 239 227 / ${PANEL_OPACITY})`);
  });

  it("only blurs behind panels on larger screens", () => {
    const blurs = all.filter((d) => d.property.endsWith("backdrop-filter"));
    expect(blurs.length).toBeGreaterThan(0);
    for (const d of blurs) expect(d.within.some((w) => w.includes("min-width: 768px"))).toBe(true);
  });

  it("keeps the scene out of the admin", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    for (const file of walk(fileURLToPath(new URL("../app/admin", import.meta.url))).filter((f) => /\.tsx?$/.test(f))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/site\/world|site-world/);
    }
  });
});
