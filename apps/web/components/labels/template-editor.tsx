"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { B1_MAX_WIDTH_MM, LABEL_LIMITS, LABEL_PRESETS, labelTemplateBodySchema, sizeLabel, type LabelTemplateBody } from "@ffa/validators";
import { saveTemplateAction } from "@/app/admin/labels/templates/actions";
import { Alert, Button, Card, Checkbox, Field, Input, Select } from "@/components/ui";
import { renderLabel, svgDataUrl } from "@/lib/labels/client";
import type { TemplateDto } from "@/lib/labels/types";

const SAMPLES = {
  short: { title: "Luna Moth Shadowbox", priceCents: 14500 as number | null, label: "A normal title" },
  long: { title: "Framed Emerald Swallowtail Butterfly Display With Botanical Border", priceCents: 28000 as number | null, label: "A very long title" },
  none: { title: "Stag Beetle", priceCents: null as number | null, label: "No price set" },
} as const;

const blank = (): LabelTemplateBody => ({ ...LABEL_PRESETS[0]!.body, name: "My label" });

const toBody = (t: TemplateDto): LabelTemplateBody => ({
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

/** Numbers are typed as text so a half-typed "4." never jumps around, and turned into numbers when valid. */
const num = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? Number.NaN : Number(text));

export function TemplateEditor({ template, isTest, baseUrl }: { template: TemplateDto | null; isTest: boolean; baseUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState<LabelTemplateBody>(() => (template ? toBody(template) : blank()));
  const [text, setText] = useState(() => {
    const b = template ? toBody(template) : blank();
    return { widthMm: String(b.widthMm), heightMm: String(b.heightMm), marginMm: String(b.marginMm), textScale: String(b.textScale), logo: String(Math.round(b.logoAreaRatio * 100)) };
  });
  const [sample, setSample] = useState<keyof typeof SAMPLES>("short");
  const [preview, setPreview] = useState<{ svg: string; width: number; height: number; warnings: string[]; moduleSize: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const candidate = useMemo(
    () => ({ ...body, widthMm: num(text.widthMm), heightMm: num(text.heightMm), marginMm: num(text.marginMm), textScale: num(text.textScale), logoAreaRatio: num(text.logo) / 100 }),
    [body, text],
  );
  const parsed = useMemo(() => labelTemplateBodySchema.safeParse(candidate), [candidate]);

  useEffect(() => {
    if (!parsed.success) return;
    let cancelled = false;
    renderLabel({ sku: "FFA-000123", title: SAMPLES[sample].title, priceCents: SAMPLES[sample].priceCents, baseUrl, isTest }, parsed.data)
      .then((r) => !cancelled && setPreview({ svg: r.svg, width: r.width, height: r.height, warnings: r.warnings, moduleSize: r.moduleSize }))
      .catch((e) => !cancelled && setMessage({ tone: "error", text: e instanceof Error ? e.message : "The preview could not be drawn." }));
    return () => {
      cancelled = true;
    };
  }, [parsed, sample, baseUrl, isTest]);

  function applyPreset(key: string) {
    const preset = LABEL_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const b = { ...preset.body, name: body.name === blank().name || body.name === "" ? preset.body.name : body.name };
    setBody(b);
    setText({ widthMm: String(b.widthMm), heightMm: String(b.heightMm), marginMm: String(b.marginMm), textScale: String(b.textScale), logo: String(Math.round(b.logoAreaRatio * 100)) });
  }

  function save() {
    if (!parsed.success) return;
    setMessage(null);
    start(async () => {
      const result = await saveTemplateAction(template?.id ?? null, parsed.data);
      if (!result.ok) return setMessage({ tone: "error", text: result.message });
      if (!template) router.push(`/admin/labels/templates?edit=${result.id}&saved=${encodeURIComponent("Template added.")}`);
      else {
        setMessage({ tone: "success", text: "Saved. It applies to labels printed from now on; labels already printed are not changed." });
        router.refresh();
      }
    });
  }

  const fieldError = (path: string) => (parsed.success ? null : parsed.error.issues.find((i) => i.path[0] === path)?.message);
  const set = <K extends keyof LabelTemplateBody>(key: K, value: LabelTemplateBody[K]) => setBody((b) => ({ ...b, [key]: value }));
  const setShow = (key: keyof LabelTemplateBody["show"], value: boolean) => setBody((b) => ({ ...b, show: { ...b.show, [key]: value } }));
  const mm = (moduleSize: number) => ((moduleSize / 203) * 25.4).toFixed(2);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <Card title={template ? `Edit "${template.name}"` : "New label design"}>
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        {!template ? (
          <Field label="Start from" htmlFor="preset" hint="Fills in the size and what is shown. You can change everything after.">
            <Select id="preset" defaultValue="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
              <option value="">Pick a starting point</option>
              {LABEL_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.body.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Name" htmlFor="name">
          <Input id="name" value={body.name} maxLength={60} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(fieldError("name"))} />
          {fieldError("name") ? <p className="mt-1 text-sm text-danger">{fieldError("name")}</p> : null}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Width (mm)" htmlFor="w" hint={`${LABEL_LIMITS.sizeMm.min} to ${LABEL_LIMITS.sizeMm.max}. The B1 prints up to about ${B1_MAX_WIDTH_MM} mm wide.`}>
            <Input id="w" inputMode="decimal" value={text.widthMm} onChange={(e) => setText({ ...text, widthMm: e.target.value })} aria-invalid={Boolean(fieldError("widthMm"))} />
          </Field>
          <Field label="Height (mm)" htmlFor="h">
            <Input id="h" inputMode="decimal" value={text.heightMm} onChange={(e) => setText({ ...text, heightMm: e.target.value })} aria-invalid={Boolean(fieldError("heightMm"))} />
          </Field>
          <Field label="Margin (mm)" htmlFor="m" hint="Blank space round the edge.">
            <Input id="m" inputMode="decimal" value={text.marginMm} onChange={(e) => setText({ ...text, marginMm: e.target.value })} aria-invalid={Boolean(fieldError("marginMm"))} />
          </Field>
        </div>
        {fieldError("widthMm") || fieldError("heightMm") || fieldError("marginMm") ? (
          <p className="mb-3 text-sm text-danger">{fieldError("widthMm") ?? fieldError("heightMm") ?? fieldError("marginMm")}</p>
        ) : null}

        <fieldset className="mb-3">
          <legend className="mb-1 font-medium text-forest">What to show</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Checkbox label="QR code" checked={body.show.qr} onChange={(e) => setShow("qr", e.target.checked)} />
            <Checkbox label="SKU" checked={body.show.sku} onChange={(e) => setShow("sku", e.target.checked)} />
            <Checkbox label="Title" checked={body.show.title} onChange={(e) => setShow("title", e.target.checked)} />
            <Checkbox label="Price" checked={body.show.price} onChange={(e) => setShow("price", e.target.checked)} hint="Labels show the piece's current price, even if the website hides it." />
          </div>
          {fieldError("show") ? <p className="text-sm text-danger">{fieldError("show")}</p> : null}
        </fieldset>

        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Text alignment" htmlFor="align">
            <Select id="align" value={body.align} onChange={(e) => set("align", e.target.value as "left" | "center")}>
              <option value="left">Left</option>
              <option value="center">Centred</option>
            </Select>
          </Field>
          <Field label="Text size" htmlFor="ts" hint={`${LABEL_LIMITS.textScale.min} to ${LABEL_LIMITS.textScale.max}. 1 is normal.`}>
            <Input id="ts" inputMode="decimal" value={text.textScale} onChange={(e) => setText({ ...text, textScale: e.target.value })} aria-invalid={Boolean(fieldError("textScale"))} />
          </Field>
          <Field label="Logo in the QR (%)" htmlFor="logo" hint="0 for none. 12 is proven to scan.">
            <Input id="logo" inputMode="numeric" value={text.logo} onChange={(e) => setText({ ...text, logo: e.target.value })} aria-invalid={Boolean(fieldError("logoAreaRatio"))} />
          </Field>
        </div>
        {fieldError("textScale") || fieldError("logoAreaRatio") ? <p className="mb-3 text-sm text-danger">{fieldError("textScale") ?? fieldError("logoAreaRatio")}</p> : null}
        <Checkbox label="Upper-case web address in the QR" hint="Makes the QR dots bigger, which helps on very small labels. The address scans the same." checked={body.uppercaseUrl} onChange={(e) => set("uppercaseUrl", e.target.checked)} />

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!parsed.success || pending}>
            {pending ? "Saving..." : template ? "Save changes" : "Add this design"}
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Preview">
          <Field label="Sample piece" htmlFor="sample">
            <Select id="sample" value={sample} onChange={(e) => setSample(e.target.value as keyof typeof SAMPLES)}>
              {Object.entries(SAMPLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          {parsed.success && preview ? (
            <div aria-live="polite">
              <img src={svgDataUrl(preview.svg)} width={preview.width} height={preview.height} alt="Preview of the label" className="max-w-full border border-stone bg-white shadow-sm" style={{ imageRendering: "pixelated" }} />
              <p className="mt-2 text-sm text-moss">
                {sizeLabel(parsed.data)}, drawn at the printer&apos;s 203 dots per inch.
                {preview.moduleSize ? ` QR dots are ${mm(preview.moduleSize)} mm.` : ""}
              </p>
              {preview.warnings.map((w) => (
                <p key={w} className="mt-2 rounded-lg border border-stone bg-cream p-3 text-sm">
                  {w}
                </p>
              ))}
              {parsed.data.widthMm > B1_MAX_WIDTH_MM ? <p className="mt-2 text-sm text-moss">Wider than the B1 can print, so this design is for PDF and A4 sheets only.</p> : null}
            </div>
          ) : (
            <p className="text-moss">Fix the highlighted fields to see the label.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
