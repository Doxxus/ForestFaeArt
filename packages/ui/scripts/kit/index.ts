/**
 * Draws the SVG kit and writes it to apps/web/public/kit, plus a manifest the website reads for each asset's size.
 *
 *   pnpm --filter @ffa/ui kit            write the files
 *   pnpm --filter @ffa/ui kit --preview  also write PNG previews to packages/ui/.tmp/kit-preview (git-ignored)
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { ASSETS, buildAll } from "./build";
import { SCENE_ASSETS, buildScene } from "./scenery";
import { buildSamples, sampleModule } from "./samples";
import { ogImageSvg, touchIconSvg } from "./social";
import { colors } from "./toolkit";
import { world } from "../../src/tokens";

const webDir = fileURLToPath(new URL("../../../../apps/web/", import.meta.url));
const apiMediaDir = fileURLToPath(new URL("../../../../apps/api/src/media/", import.meta.url));
const outDir = `${webDir}public/kit/`;
const sceneDir = `${webDir}public/scene/`;
const previewDir = fileURLToPath(new URL("../../.tmp/kit-preview/", import.meta.url));

mkdirSync(outDir, { recursive: true });
const built = buildAll();
const keep = new Set(built.map((b) => `${b.name}.svg`));
for (const file of readdirSync(outDir)) if (file.endsWith(".svg") && !keep.has(file)) rmSync(`${outDir}${file}`);
for (const b of built) writeFileSync(`${outDir}${b.name}.svg`, b.svg);

const manifest =
  `// Written by "pnpm --filter @ffa/ui kit". Do not edit by hand.\n` +
  `export const KIT = {\n${built
    .map((b) => `  "${b.name}": { width: ${b.width}, height: ${b.height}, bytes: ${b.svg.length}, use: ${JSON.stringify(ASSETS.find((a) => a.name === b.name)!.use)} },`)
    .join("\n")}\n} as const;\n\n` +
  `export type KitName = keyof typeof KIT;\n`;
writeFileSync(`${webDir}lib/kit-manifest.ts`, manifest);
for (const b of built) console.log(`${b.name.padEnd(22)} ${String(b.svg.length).padStart(6)} bytes  ${b.width}x${b.height}`);

// The scenery for the public site's green world (ADR 012).
mkdirSync(sceneDir, { recursive: true });
const scenery = buildScene();
const keepScene = new Set(scenery.map((b) => `${b.name}.svg`));
for (const file of readdirSync(sceneDir)) if (file.endsWith(".svg") && !keepScene.has(file)) rmSync(`${sceneDir}${file}`);
for (const b of scenery) writeFileSync(`${sceneDir}${b.name}.svg`, b.svg);
writeFileSync(
  `${webDir}lib/scene-manifest.ts`,
  `// Written by "pnpm --filter @ffa/ui kit". Do not edit by hand.\n` +
    `export const SCENE = {\n${scenery
      .map((b) => `  "${b.name}": { width: ${b.width}, height: ${b.height}, bytes: ${b.svg.length}, use: ${JSON.stringify(SCENE_ASSETS.find((a) => a.name === b.name)!.use)} },`)
      .join("\n")}\n} as const;\n\n` +
    `export type SceneName = keyof typeof SCENE;\n`,
);
for (const b of scenery) console.log(`scene ${b.name.padEnd(16)} ${String(b.svg.length).padStart(6)} bytes  ${b.width}x${b.height}`);

// The four pictures for the sample pieces (SAMP-4), compiled into the API so no storage is needed.
const samples = buildSamples();
writeFileSync(`${apiMediaDir}sample-art.generated.ts`, sampleModule(samples));
for (const s of samples) console.log(`sample ${s.name.padEnd(15)} ${String(s.svg.length).padStart(6)} bytes`);

// Favicon (the approved small mark, ADR 005), touch icon and the default link-preview picture.
const favicon = readFileSync(fileURLToPath(new URL("../../brand/logo-directions/C-minimal-mark-icon-colour.svg", import.meta.url)), "utf8");
writeFileSync(`${webDir}public/favicon.svg`, favicon);
const markInner = favicon.replace(/^[\s\S]*?<g transform="translate\(256 262\) scale\(1\.45\)">/, "").replace(/<\/g><\/svg>\s*$/, "");
writeFileSync(`${webDir}public/apple-touch-icon.png`, new Resvg(touchIconSvg(markInner), { fitTo: { mode: "width", value: 180 } }).render().asPng());
writeFileSync(`${webDir}public/og-default.png`, new Resvg(ogImageSvg(), { fitTo: { mode: "width", value: 1200 } }).render().asPng());

if (process.argv.includes("--preview")) {
  mkdirSync(previewDir, { recursive: true });
  for (const b of built) {
    const dark = b.name.endsWith("-light");
    const png = new Resvg(b.svg, { fitTo: { mode: "width", value: Math.min(900, Math.max(300, b.width * 2)) }, background: dark ? colors.forest : colors.sage }).render().asPng();
    writeFileSync(`${previewDir}${b.name}.png`, png);
  }
  console.log(`Previews in ${previewDir}`);
  // The scene as a phone and a desktop would see it at the top and at the bottom of a page (what the CSS does with scroll).
  const inner = (name: string) =>
    scenery
      .find((s) => s.name === name)!
      .svg.replace(/^<svg[^>]*>/, "")
      .replace(/<\/svg>$/, "")
      // Each file has its own ids; keep them apart once the layers share one page.
      .replace(/id="([^"]+)"/g, `id="${name}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${name}-$1)`);
  const nested = (name: string, vw: number, top: number, height: number) => {
    const s = scenery.find((x) => x.name === name)!;
    return `<svg x="0" y="${top}" width="${vw}" height="${height}" viewBox="0 0 ${s.width} ${s.height}" preserveAspectRatio="xMidYMin slice" overflow="hidden">${inner(name)}</svg>`;
  };
  for (const [label, vw, vh] of [["desktop", 1280, 800], ["phone", 390, 780]] as const) {
    for (const [state, k] of [["top", 0], ["bottom", 1]] as const) {
      const travel = { far: 60, mid: 140, near: 190 };
      const vis = { far: 0.46, mid: 0.56, near: 0.18 };
      const layer = (name: "far" | "mid" | "near") => {
        const h = vh * vis[name] + travel[name];
        return nested(name, vw, vh - vh * vis[name] - travel[name] * k, h);
      };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${world.sky}"/><stop offset="1" stop-color="${world.meadow}"/></linearGradient></defs><rect width="${vw}" height="${vh}" fill="url(#sky)"/>${layer("far")}${layer("mid")}${layer("near")}</svg>`;
      writeFileSync(`${previewDir}scene-${label}-${state}.png`, new Resvg(svg).render().asPng());
    }
  }
  for (const s of scenery) {
    writeFileSync(`${previewDir}scene-${s.name}.png`, new Resvg(s.svg, { fitTo: { mode: "width", value: Math.min(1200, Math.max(300, s.width * 2)) }, background: world.meadow }).render().asPng());
  }

}
