import type { Metadata } from "next";
import { AA_LARGE, AA_NORMAL, PANEL_OPACITY, colors, contrast, fonts, textPairs, world } from "@ffa/ui";
import { Kit, Scene } from "@/components/site/kit";
import { Badge, Button, Card, Field, Input, PageHeader, buttonClass } from "@/components/ui";
import { KIT, type KitName } from "@/lib/kit-manifest";
import { SCENE, type SceneName } from "@/lib/scene-manifest";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Style guide" };

const GROUNDS = [
  ["bg-cream", "On cream"],
  ["bg-sage", "On sage"],
] as const;

export default async function StyleGuide() {
  await requireUser();
  const names = Object.keys(KIT) as KitName[];
  const totalKb = Math.round(names.reduce((sum, n) => sum + KIT[n].bytes, 0) / 1024);
  const sceneNames = Object.keys(SCENE) as SceneName[];
  const sceneKb = Math.round(sceneNames.reduce((sum, n) => sum + SCENE[n].bytes, 0) / 1024);

  return (
    <>
      <PageHeader title="Style guide" intro="Every colour, type style and piece of art the website is built from. This page is only for signed-in staff." />

      <Card title="Colours" className="mb-6">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(colors).map(([name, hex]) => (
            <li key={name} className="overflow-hidden rounded-lg border border-stone">
              <div className="h-14" style={{ background: hex }} />
              <div className="bg-cream p-2 text-sm">
                <p className="font-medium text-forest">{name}</p>
                <p className="text-moss">{hex}</p>
              </div>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 mt-6 font-display text-lg text-forest">Text on a background (checked against WCAG 2.1 AA)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="text-forest">
                <th scope="col" className="border-b border-stone py-1 pr-3">Sample</th>
                <th scope="col" className="border-b border-stone py-1 pr-3">Use</th>
                <th scope="col" className="border-b border-stone py-1 pr-3">Ratio</th>
                <th scope="col" className="border-b border-stone py-1">Needs</th>
              </tr>
            </thead>
            <tbody>
              {textPairs.map((p) => {
                const ratio = contrast(colors[p.fg], colors[p.bg]);
                const need = p.level === "large" ? AA_LARGE : AA_NORMAL;
                return (
                  <tr key={`${p.fg}-${p.bg}`}>
                    <td className="border-b border-stone/60 py-1 pr-3">
                      <span className={`inline-block rounded px-2 py-0.5 font-display ${p.level === "large" ? "text-2xl" : "text-base"}`} style={{ color: colors[p.fg], background: colors[p.bg] }}>
                        {p.fg} on {p.bg}
                      </span>
                    </td>
                    <td className="border-b border-stone/60 py-1 pr-3">{p.use}</td>
                    <td className="border-b border-stone/60 py-1 pr-3">{ratio.toFixed(2)}</td>
                    <td className="border-b border-stone/60 py-1">
                      {need}:1 {ratio >= need ? <Badge tone="good">Passes</Badge> : <Badge tone="bad">Fails</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-moss">Copper and gold are for large display text and graphics only. Use deep copper for normal-size accent text.</p>
      </Card>

      <Card title="Type" className="mb-6">
        <p className="mb-1 text-sm text-moss">Headings and the wordmark: {fonts.display} (self-hosted, open licence). Body text: the reader&apos;s own system font, which keeps pages fast.</p>
        <p className="foil font-display text-5xl uppercase tracking-[0.1em]">Forest Fae Folk Art</p>
        <h1 className="mt-4 font-display text-4xl text-forest">Heading one, a page title</h1>
        <h2 className="mt-2 font-display text-3xl text-forest">Heading two, a section</h2>
        <h3 className="mt-2 font-display text-xl text-forest">Heading three, a card or panel</h3>
        <p className="mt-3 max-w-prose text-lg">Body text is set generously. Lines stay under about 65 characters, and a blank line begins a new paragraph. The quick brown fox jumps over the lazy dog.</p>
        <p className="mt-2 text-moss">Secondary text sits in moss on cream.</p>
      </Card>

      <Card title="Buttons and fields" className="mb-6">
        <div className="mb-4 flex flex-wrap gap-3">
          <Button>Primary</Button>
          <span className={buttonClass("secondary")}>Secondary</span>
          <span className={buttonClass("ghost")}>Quiet</span>
          <span className={buttonClass("danger")}>Careful</span>
          <Badge>Neutral</Badge>
          <Badge tone="good">Good</Badge>
          <Badge tone="warn">Heads up</Badge>
          <Badge tone="bad">Problem</Badge>
        </div>
        <div className="max-w-sm">
          <Field label="A text field" htmlFor="sample" hint="Every field has a visible label and, where useful, a hint.">
            <Input id="sample" placeholder="Placeholder text" />
          </Field>
        </div>
      </Card>

      <Card title="The green world (public site)" className="mb-6">
        <p className="mb-4 text-moss">
          The public website sits in a layered woodland that moves a little as you scroll (see ADR 012). These colours and pieces are used only there, never in this admin. Reading panels are cream at {Math.round(PANEL_OPACITY * 100)}% opacity, so text always has enough contrast, even over the darkest scenery.
        </p>
        <ul className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(world).map(([name, hex]) => (
            <li key={name} className="overflow-hidden rounded-lg border border-stone">
              <div className="h-12" style={{ background: hex }} />
              <div className="bg-cream p-2 text-sm">
                <p className="font-medium text-forest">{name}</p>
                <p className="text-moss">{hex}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-moss">
          {sceneNames.length} pieces, {sceneKb} KB in all. The three layers (far, mid, near) and the footer grass load with the home page. Toadstools grow as they scroll into view, and the leaves drift past. Everything stands still for people who ask for reduced motion, and in browsers that can&apos;t do scroll animation.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sceneNames.map((name) => {
            const a = SCENE[name];
            const wide = a.width >= 600;
            return (
              <li key={name} className={`overflow-hidden rounded-lg border border-stone ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
                <div className="flex h-40 items-center justify-center p-3" style={{ background: `linear-gradient(${world.sky}, ${world.meadow})` }}>
                  <Scene name={name} className="max-h-full w-auto max-w-full" eager />
                </div>
                <div className="bg-cream p-3 text-sm">
                  <p className="font-medium text-forest">{name}</p>
                  <p className="text-moss">{a.use}</p>
                  <p className="text-moss">
                    {a.width} x {a.height}, {(a.bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={`Art kit (${names.length} pieces, ${totalKb} KB in all)`} className="mb-6">
        <p className="mb-4 text-moss">
          All drawn from scratch in code (nothing stock, traced or generated), then optimised. Regenerate with <code>pnpm --filter @ffa/ui kit</code>. Each file is lazy-loaded, cached by the browser, and hidden from screen readers. Motion is CSS only and switches off for people who ask for reduced motion.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {names.map((name) => {
            const a = KIT[name];
            const light = name.endsWith("-light");
            return (
              <li key={name} className="overflow-hidden rounded-lg border border-stone">
                <div className="grid grid-cols-2">
                  {(light ? ([["bg-forest", "On forest"]] as const) : GROUNDS).map(([bg, label]) => (
                    <div key={bg} className={`${bg} ${light ? "col-span-2" : ""} flex h-40 items-center justify-center p-3`} title={label}>
                      <Kit name={name} className="max-h-full w-auto max-w-full" eager />
                    </div>
                  ))}
                </div>
                <div className="bg-cream p-3 text-sm">
                  <p className="font-medium text-forest">{name}</p>
                  <p className="text-moss">{a.use}</p>
                  <p className="text-moss">
                    {a.width} x {a.height}, {(a.bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
