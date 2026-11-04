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
import { ogImageSvg, touchIconSvg } from "./social";
import { colors } from "./toolkit";

const webDir = fileURLToPath(new URL("../../../../apps/web/", import.meta.url));
const outDir = `${webDir}public/kit/`;
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
}
