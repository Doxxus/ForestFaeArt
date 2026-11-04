"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { B1_MAX_WIDTH_MM, LABEL_LIMITS, sizeLabel, type LabelTemplateBody } from "@ffa/validators";
import type { SheetPlan } from "@ffa/label-engine";
import { recordPrintAction } from "@/app/admin/labels/actions";
import { Alert, Badge, Button, Card, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { bluetoothAvailable, connectB1, disconnectB1, printCanvases, type B1Connection } from "@/lib/niimbot";
import {
  canShareFiles,
  canvasToPng,
  downloadFile,
  engine,
  makeZip,
  renderLabel,
  safeName,
  shareFiles,
  svgDataUrl,
  svgToBlackWhiteCanvas,
  type FileOut,
} from "@/lib/labels/client";
import type { LabelContextDto, LabelItemDto, TemplateDto } from "@/lib/labels/types";
import { money } from "@/lib/format";

type Output = "NIIMBOT_B1" | "PNG" | "PDF" | "A4";

const OUTPUTS: { id: Output; label: string; hint: string }[] = [
  { id: "NIIMBOT_B1", label: "Print on the B1 (Bluetooth)", hint: "Straight to the NIIMBOT B1 from this phone, without the NIIMBOT app. Chrome on Android only." },
  { id: "PNG", label: "Pictures for the NIIMBOT app (PNG)", hint: "One picture per label. Open or share them into the NIIMBOT app to print." },
  { id: "PDF", label: "PDF, one label per page", hint: "Each page is exactly label-sized." },
  { id: "A4", label: "A4 sheet (many labels per page)", hint: "For a normal printer, on plain paper or sticker sheets." },
];

const STATE_BADGE = { NONE: ["neutral", "No label yet"], CURRENT: ["good", "Label up to date"], STALE: ["bad", "Label out of date"] } as const;

const asBody = (t: TemplateDto): LabelTemplateBody => ({
  name: t.name,
  widthMm: t.widthMm,
  heightMm: t.heightMm,
  marginMm: t.marginMm,
  logoAreaRatio: t.logoAreaRatio,
  uppercaseUrl: t.uppercaseUrl,
  show: t.show,
  align: t.align,
  textScale: t.textScale,
});

interface Preview {
  sku: string;
  svg: string;
  width: number;
  height: number;
  warnings: string[];
}

export function PrintLabels({ items, templates, context, truncated }: { items: LabelItemDto[]; templates: TemplateDto[]; context: LabelContextDto; truncated: boolean }) {
  const [picked, setPicked] = useState(() => new Set(items.map((i) => i.productId)));
  const [copies, setCopies] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.productId, 1])));
  const [templateId, setTemplateId] = useState(() => (templates.find((t) => t.isDefault) ?? templates[0])?.id ?? "");
  const [output, setOutput] = useState<Output>("PNG");
  const [sheet, setSheet] = useState({ marginMm: 5, gapMm: 0, marks: "none" as "none" | "crop" | "border", startCell: 1 });
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [plan, setPlan] = useState<SheetPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ message: string; files: FileOut[] } | null>(null);
  const [canBluetooth, setCanBluetooth] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const b1 = useRef<B1Connection | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const chosen = useMemo(() => items.filter((i) => picked.has(i.productId)), [items, picked]);
  const totalLabels = chosen.reduce((n, i) => n + (copies[i.productId] ?? 1), 0);

  useEffect(() => {
    setCanBluetooth(bluetoothAvailable());
  }, []);

  // Live preview: the first few chosen pieces drawn with the chosen template.
  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    (async () => {
      const body = asBody(template);
      const out: Preview[] = [];
      for (const item of chosen.slice(0, 3)) {
        const r = await renderLabel({ sku: item.sku, title: item.title, priceCents: item.priceCents, baseUrl: context.baseUrl, isTest: context.isTest }, body);
        out.push({ sku: item.sku, svg: r.svg, width: r.width, height: r.height, warnings: r.warnings });
      }
      if (!cancelled) setPreviews(out);
    })().catch((e) => !cancelled && setError(e instanceof Error ? e.message : "The preview could not be drawn."));
    return () => {
      cancelled = true;
    };
  }, [template, chosen, context.baseUrl, context.isTest]);

  // The A4 layout is plain geometry, so it updates instantly as the options change.
  useEffect(() => {
    if (output !== "A4" || !template) return setPlan(null);
    let cancelled = false;
    engine().then(({ planSheet }) => {
      if (!cancelled) setPlan(planSheet(totalLabels, template.widthMm, template.heightMm, { ...sheet, startCell: Math.max(0, sheet.startCell - 1) }));
    });
    return () => {
      cancelled = true;
    };
  }, [output, template, totalLabels, sheet]);

  const tooWideForB1 = output === "NIIMBOT_B1" && template ? template.widthMm > B1_MAX_WIDTH_MM : false;
  const warnings = [...new Set(previews.flatMap((p) => p.warnings))];

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function make() {
    if (!template || !chosen.length) return;
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const body = asBody(template);
      const e = await engine();
      const scale = output === "PDF" || output === "A4" ? 3 : 1;
      const made: { item: LabelItemDto; canvas: HTMLCanvasElement; copies: number }[] = [];
      for (const [n, item] of chosen.entries()) {
        setStatus(`Drawing label ${n + 1} of ${chosen.length}...`);
        const r = await renderLabel({ sku: item.sku, title: item.title, priceCents: item.priceCents, baseUrl: context.baseUrl, isTest: context.isTest }, body);
        made.push({ item, canvas: await svgToBlackWhiteCanvas(r.svg, r.width, r.height, scale), copies: copies[item.productId] ?? 1 });
        if (n % 5 === 4) await new Promise((r2) => setTimeout(r2, 0));
      }

      let files: FileOut[] = [];
      let message = "";
      if (output === "NIIMBOT_B1") {
        setStatus("Connecting to the printer...");
        if (!b1.current) b1.current = await connectB1();
        await printCanvases(
          b1.current,
          made.map((m) => ({ canvas: m.canvas, copies: m.copies })),
          { onProgress: setStatus },
        );
        message = `Sent ${totalLabels} ${totalLabels === 1 ? "label" : "labels"} to the B1.`;
      } else if (output === "PNG") {
        setStatus("Making pictures...");
        const pngs: FileOut[] = [];
        for (const m of made) {
          const bytes = await canvasToPng(m.canvas);
          for (let c = 1; c <= m.copies; c++) pngs.push({ name: `${safeName(m.item.sku)}${m.copies > 1 ? `-${c}of${m.copies}` : ""}.png`, type: "image/png", bytes });
        }
        files = pngs.length === 1 ? pngs : [makeZip(pngs)];
        message = `Made ${pngs.length} ${pngs.length === 1 ? "picture" : "pictures"}. ${pngs.length > 1 ? "Unzip them, then open them in the NIIMBOT app." : "Open it in the NIIMBOT app to print."}`;
      } else {
        setStatus("Making the PDF...");
        const png = await Promise.all(made.map(async (m) => ({ key: `${m.item.sku}|${m.item.title}|${m.item.priceCents}`, png: await canvasToPng(m.canvas) })));
        const expanded = made.flatMap((m, i) => Array.from({ length: m.copies }, () => png[i]!));
        let pdf: Uint8Array;
        if (output === "PDF") {
          pdf = await e.buildPdf(e.labelPages(expanded, template.widthMm, template.heightMm), "Labels");
          message = `Made a ${expanded.length}-page PDF, one label per page.`;
        } else {
          const sheetOptions = { ...sheet, startCell: Math.max(0, sheet.startCell - 1) };
          const p = e.planSheet(expanded.length, template.widthMm, template.heightMm, sheetOptions);
          if (!p.pages.length) throw new Error(p.warnings[0] ?? "These labels don't fit on the page.");
          pdf = await e.buildPdf(e.sheetPages(p, expanded, template.widthMm, template.heightMm, e.DEFAULT_SHEET), "Label sheet");
          message = `Made ${p.pages.length} ${p.pages.length === 1 ? "page" : "pages"} with ${expanded.length} labels.`;
        }
        files = [{ name: `labels-${new Date().toISOString().slice(0, 10)}.pdf`, type: "application/pdf", bytes: pdf }];
      }

      setStatus("Saving the print record...");
      const recorded = await recordPrintAction({
        items: made.map((m) => ({ productId: m.item.productId, copies: m.copies, title: m.item.title, priceCents: m.item.priceCents })),
        templateId: template.id,
        format: sizeLabel(template).replace(/ mm$/, "").replace(/ /g, ""),
        printer: output,
      });
      if (!recorded.ok) message += ` (It could not be added to the print history: ${recorded.message})`;
      setDone({ message, files });
      setCanShare(files.length > 0 && canShareFiles(files));
      if (files[0]) downloadFile(files[0]);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (output === "NIIMBOT_B1") {
        await disconnectB1(b1.current);
        b1.current = null;
      }
      setError(/cancel|chosen|NotFound/i.test(text) ? "No printer was chosen. Try again, or use the picture option instead." : text);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  if (!items.length) return null;

  return (
    <div className="space-y-5">
      {context.isTest ? (
        <Alert>
          <strong>Test labels.</strong> {context.environment === "production" ? "The QR address isn't the real website address, so" : "This isn't the live system, so"} every label is stamped TEST and the QR codes point at {context.baseUrl}. Real labels are printed once the live website is running.
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {truncated ? <Alert>Only the first {LABEL_LIMITS.maxProductsPerPrint} pieces are shown. Print these, then choose the rest.</Alert> : null}

      <Card title={`1. Pieces (${chosen.length} of ${items.length} chosen, ${totalLabels} ${totalLabels === 1 ? "label" : "labels"})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPicked(new Set(items.map((i) => i.productId)))}>
            Choose all
          </Button>
          <Button variant="secondary" onClick={() => setPicked(new Set())}>
            Choose none
          </Button>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Print</Th>
              <Th>Piece</Th>
              <Th>Price</Th>
              <Th>Label</Th>
              <Th>Copies</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const [tone, text] = STATE_BADGE[i.state];
              return (
                <tr key={i.productId}>
                  <Td>
                    <input type="checkbox" className="size-5 accent-forest" checked={picked.has(i.productId)} onChange={() => toggle(i.productId)} aria-label={`Print a label for ${i.title}`} />
                  </Td>
                  <Td>
                    <span className="font-medium text-forest">{i.title}</span>
                    <span className="block text-sm text-moss">{i.sku}</span>
                  </Td>
                  <Td>{money(i.priceCents)}</Td>
                  <Td>
                    <Badge tone={tone}>{text}</Badge>
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={LABEL_LIMITS.copies.min}
                      max={LABEL_LIMITS.copies.max}
                      className="w-20"
                      value={copies[i.productId] ?? 1}
                      onChange={(e) => setCopies((c) => ({ ...c, [i.productId]: Math.min(LABEL_LIMITS.copies.max, Math.max(1, Math.floor(Number(e.target.value) || 1))) }))}
                      aria-label={`Copies of ${i.title}`}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="2. Label design">
        <Field label="Label template" htmlFor="template" hint={template ? `${sizeLabel(template)}. Change templates under Label designs.` : undefined}>
          <Select id="template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        {warnings.map((w) => (
          <Alert key={w}>{w}</Alert>
        ))}
        <div className="flex flex-wrap items-end gap-4" aria-live="polite">
          {previews.map((p) => (
            <figure key={p.sku} className="m-0">
              <img src={svgDataUrl(p.svg)} width={p.width} height={p.height} alt={`Preview of the label for ${p.sku}`} className="max-w-full border border-stone bg-white shadow-sm" style={{ imageRendering: "pixelated" }} />
              <figcaption className="mt-1 text-sm text-moss">{p.sku}</figcaption>
            </figure>
          ))}
          {chosen.length === 0 ? <p className="text-moss">Choose a piece to see its label.</p> : null}
        </div>
      </Card>

      <Card title="3. How to print">
        <fieldset className="mb-2">
          <legend className="sr-only">Print method</legend>
          {OUTPUTS.map((o) => {
            const unavailable = o.id === "NIIMBOT_B1" && !canBluetooth;
            return (
              <label key={o.id} className={`mb-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${output === o.id ? "border-forest bg-cream" : "border-stone"} ${unavailable ? "opacity-60" : ""}`}>
                <input type="radio" name="output" className="mt-1 size-5 accent-forest" checked={output === o.id} onChange={() => setOutput(o.id)} disabled={unavailable} />
                <span>
                  <span className="font-medium text-forest">{o.label}</span>
                  <span className="block text-sm text-moss">{unavailable ? "Not available in this browser. Use Chrome on an Android phone." : o.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {tooWideForB1 ? <Alert tone="error">This label is wider than the B1 can print (about {B1_MAX_WIDTH_MM} mm). Pick a narrower template.</Alert> : null}

        {output === "A4" ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-x-4 sm:grid-cols-4">
              <Field label="Page margin (mm)" htmlFor="sm" hint="Most printers can't print closer than 4 mm to the edge.">
                <Input id="sm" type="number" min={0} max={30} step={0.5} value={sheet.marginMm} onChange={(e) => setSheet({ ...sheet, marginMm: Number(e.target.value) })} />
              </Field>
              <Field label="Gap between labels (mm)" htmlFor="sg">
                <Input id="sg" type="number" min={0} max={20} step={0.5} value={sheet.gapMm} onChange={(e) => setSheet({ ...sheet, gapMm: Number(e.target.value) })} />
              </Field>
              <Field label="Cutting guides" htmlFor="smk">
                <Select id="smk" value={sheet.marks} onChange={(e) => setSheet({ ...sheet, marks: e.target.value as typeof sheet.marks })}>
                  <option value="none">None (sticker sheet)</option>
                  <option value="crop">Crop marks in the margin</option>
                  <option value="border">A thin box round each label</option>
                </Select>
              </Field>
              <Field label="Start at position" htmlFor="ss" hint="Skip labels already used on a partly used sticker sheet. 1 is the top left.">
                <Input id="ss" type="number" min={1} max={999} value={sheet.startCell} onChange={(e) => setSheet({ ...sheet, startCell: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
              </Field>
            </div>
            {plan ? <SheetPreview plan={plan} template={template} startCell={sheet.startCell - 1} /> : null}
            {plan?.warnings.map((w) => (
              <Alert key={w}>{w}</Alert>
            ))}
            <Alert>
              <strong>Printing tip:</strong> choose <em>Actual size</em> or <em>100%</em> in the print window, never &quot;Fit to page&quot;, or the labels will come out the wrong size and the QR codes may not scan.
            </Alert>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={make} disabled={busy || !chosen.length || !template || tooWideForB1 || (output === "A4" && plan?.pages.length === 0)}>
            {busy ? "Working..." : output === "NIIMBOT_B1" ? `Print ${totalLabels} on the B1` : `Make ${totalLabels} ${totalLabels === 1 ? "label" : "labels"}`}
          </Button>
          {status ? (
            <span role="status" className="text-moss">
              {status}
            </span>
          ) : null}
        </div>
      </Card>

      {done ? (
        <Alert tone="success">
          <p className="font-medium">{done.message}</p>
          {done.files.length ? (
            <p className="mt-2 flex flex-wrap gap-2">
              {done.files.map((f) => (
                <Button key={f.name} variant="secondary" onClick={() => downloadFile(f)}>
                  Download {f.name}
                </Button>
              ))}
              {canShare ? (
                <Button variant="secondary" onClick={() => shareFiles(done.files).catch(() => undefined)}>
                  Share to another app
                </Button>
              ) : null}
            </p>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}

/** First page of the sheet, drawn to scale: labels in green, skipped cells hatched, crop marks and boxes as they will print. */
function SheetPreview({ plan, template, startCell }: { plan: SheetPlan; template: TemplateDto | undefined; startCell: number }) {
  if (!template || !plan.pages.length) return null;
  const page = plan.pages[0]!;
  const W = 210;
  const H = 297;
  const skipped = Math.min(startCell, plan.grid.perPage);
  const cells = Array.from({ length: skipped }, (_, c) => ({
    x: plan.grid.originXMm + (c % plan.grid.cols) * (template.widthMm + plan.grid.gapMm),
    y: plan.grid.originYMm + Math.floor(c / plan.grid.cols) * (template.heightMm + plan.grid.gapMm),
  }));
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Page 1 of ${plan.pages.length}: ${page.slots.length} labels, ${plan.grid.cols} across and ${plan.grid.rows} down`} className="max-h-96 w-auto border border-stone bg-white">
        {skipped > 0 ? cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={template.widthMm} height={template.heightMm} fill="#EFE6CF" stroke="#B7C3A3" strokeWidth={0.3} strokeDasharray="1.5 1" />) : null}
        {page.slots.map((s) => (
          <rect key={s.item} x={s.xMm} y={s.yMm} width={template.widthMm} height={template.heightMm} fill="#DDE7CF" stroke="#2F4A3A" strokeWidth={0.3} />
        ))}
        {page.lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#000" strokeWidth={0.3} />
        ))}
      </svg>
      <figcaption className="mt-1 text-sm text-moss">
        {plan.grid.perPage} labels fit on a page ({plan.grid.cols} across, {plan.grid.rows} down). This job uses {plan.pages.length} {plan.pages.length === 1 ? "page" : "pages"}.
      </figcaption>
    </figure>
  );
}
