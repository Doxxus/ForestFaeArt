"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Select } from "@/components/ui";
import { previewImportAction, runImportAction, type PreviewData, type RunData } from "./actions";

type Stage =
  | { name: "idle" }
  | { name: "working"; what: string }
  | { name: "preview"; csv: string; filename: string; data: PreviewData }
  | { name: "done"; result: RunData }
  | { name: "failed"; message: string };

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [existing, setExisting] = useState<"skip" | "update">("skip");
  const [createMissing, setCreateMissing] = useState(false);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setStage({ name: "working", what: "Checking your file…" });
    const csv = await file.text();
    const res = await previewImportAction(csv);
    if (!res.ok) {
      if (res.signedOut) window.location.href = "/login";
      setStage({ name: "failed", message: res.message });
      return;
    }
    setCreateMissing(false);
    setStage({ name: "preview", csv, filename: file.name, data: res.data });
  }

  async function runImport(s: Extract<Stage, { name: "preview" }>) {
    setStage({ name: "working", what: "Importing. This can take a moment…" });
    const res = await runImportAction({ csv: s.csv, filename: s.filename, existing, createMissing });
    if (!res.ok) {
      if (res.signedOut) window.location.href = "/login";
      setStage({ name: "failed", message: res.message });
      return;
    }
    setStage({ name: "done", result: res.data });
    router.refresh();
  }

  if (stage.name === "working") return <Alert>{stage.what}</Alert>;

  if (stage.name === "failed") {
    return (
      <>
        <Alert tone="error">{stage.message}</Alert>
        <Button variant="secondary" onClick={() => setStage({ name: "idle" })}>
          Start again
        </Button>
      </>
    );
  }

  if (stage.name === "done") {
    const r = stage.result;
    return (
      <Card title="Import finished">
        <ul className="mb-4 list-disc pl-5 text-lg">
          <li>
            <strong>{r.created}</strong> new {r.created === 1 ? "piece" : "pieces"} added
          </li>
          {r.updated ? <li>{r.updated} updated</li> : null}
          {r.skipped ? <li>{r.skipped} already there, left alone</li> : null}
          {r.categoriesCreated ? <li>{r.categoriesCreated} new {r.categoriesCreated === 1 ? "category" : "categories"} created</li> : null}
          {r.rejected ? <li className="text-danger">{r.rejected} rows had problems and were not imported</li> : null}
        </ul>
        {r.fixCsv ? (
          <Alert tone="error">
            <p className="mb-2">Fix the rows that had problems and import that file. The last column explains what to change.</p>
            <Button variant="secondary" onClick={() => download("rows_to_fix.csv", r.fixCsv!)}>
              Download the rows to fix
            </Button>
          </Alert>
        ) : null}
        <p className="mb-4 text-moss">The new pieces are hidden from the website until they have photos. You can find them under “Needs photos”.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/products?photos=none" className="inline-flex min-h-11 items-center rounded-lg bg-forest px-4 py-2 font-medium text-cream hover:bg-moss">
            See pieces that need photos
          </Link>
          <Button variant="ghost" onClick={() => setStage({ name: "idle" })}>
            Import another file
          </Button>
        </div>
      </Card>
    );
  }

  if (stage.name === "preview") {
    const d = stage.data;
    const needsConsent = d.newCategories.length > 0 || d.newOptions.length > 0;
    const importable = d.totals.toCreate + (existing === "update" ? d.totals.alreadyThere : 0);
    const problems = d.rows.filter((r) => r.errors.length || r.warnings.length);
    return (
      <Card title={`Check: ${stage.filename}`}>
        {d.fileErrors.length ? (
          <Alert tone="error">{d.fileErrors.join(" ")}</Alert>
        ) : (
          <>
            <ul className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-lg bg-cream p-3">
                <div className="text-2xl font-semibold text-forest">{d.totals.toCreate}</div>
                <div className="text-moss">will be added</div>
              </li>
              <li className="rounded-lg bg-cream p-3">
                <div className="text-2xl font-semibold text-forest">{d.totals.alreadyThere}</div>
                <div className="text-moss">already there</div>
              </li>
              <li className="rounded-lg bg-cream p-3">
                <div className={`text-2xl font-semibold ${d.totals.withErrors ? "text-danger" : "text-forest"}`}>{d.totals.withErrors}</div>
                <div className="text-moss">with problems</div>
              </li>
              <li className="rounded-lg bg-cream p-3">
                <div className="text-2xl font-semibold text-forest">{d.totals.withWarnings}</div>
                <div className="text-moss">with notes</div>
              </li>
            </ul>
            {d.unknownColumns.length ? <Alert>These columns aren&apos;t recognised and will be ignored: {d.unknownColumns.join(", ")}.</Alert> : null}

            {needsConsent ? (
              <Alert tone="info">
                <p className="mb-2 font-medium text-forest">Some things in your file don&apos;t exist yet:</p>
                <ul className="mb-2 list-disc pl-5">
                  {d.newCategories.length ? <li>New categories: {d.newCategories.join(", ")}</li> : null}
                  {d.newOptions.map((o) => (
                    <li key={o.fieldKey}>
                      New choices for {o.fieldLabel}: {o.options.join(", ")}
                    </li>
                  ))}
                </ul>
                <Checkbox label="Yes, create these" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                {!createMissing ? <p className="text-sm">Without this, the rows that need them are skipped.</p> : null}
              </Alert>
            ) : null}

            {d.totals.alreadyThere ? (
              <div className="mb-4 max-w-md">
                <label htmlFor="existing" className="mb-1 block font-medium text-forest">
                  For pieces that are already there
                </label>
                <Select id="existing" value={existing} onChange={(e) => setExisting(e.target.value as "skip" | "update")}>
                  <option value="skip">Leave them as they are</option>
                  <option value="update">Update their details (never their stock or status)</option>
                </Select>
              </div>
            ) : null}

            {problems.length ? (
              <details className="mb-4 rounded-lg border border-stone bg-cream p-3" open={d.totals.withErrors > 0 && problems.length <= 10}>
                <summary className="cursor-pointer font-medium text-forest">
                  {problems.length} {problems.length === 1 ? "row needs" : "rows need"} a look
                </summary>
                <ul className="mt-2 space-y-2">
                  {problems.map((r) => (
                    <li key={r.line}>
                      <span className="font-medium">
                        Line {r.line}
                        {r.title ? `: ${r.title}` : ""}
                      </span>{" "}
                      {r.errors.length ? <Badge tone="bad">Won&apos;t import</Badge> : <Badge tone="warn">Note</Badge>}
                      <ul className="ml-5 list-disc text-sm">
                        {r.errors.map((m) => (
                          <li key={m} className="text-danger">
                            {m}
                          </li>
                        ))}
                        {r.warnings.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {d.fixCsv ? (
              <Button variant="ghost" className="mb-3" onClick={() => download("rows_to_fix.csv", d.fixCsv!)}>
                Download the rows with problems
              </Button>
            ) : null}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {!d.fileErrors.length ? (
            <Button onClick={() => runImport(stage)} disabled={importable === 0}>
              Import {importable} {importable === 1 ? "piece" : "pieces"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setStage({ name: "idle" })}>
            Choose a different file
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="1. Choose your file">
      <p className="mb-3 text-moss">Nothing is saved until you press Import on the next screen.</p>
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-forest px-4 py-2 font-medium text-cream hover:bg-moss">
        Choose a CSV file
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void chooseFile(e.target.files?.[0])} />
      </label>
    </Card>
  );
}
