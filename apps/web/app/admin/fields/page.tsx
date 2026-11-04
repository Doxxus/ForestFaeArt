import type { Metadata } from "next";
import { METADATA_FIELD_TYPES } from "@ffa/validators";
import { Badge, Button, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireUser, serverApi } from "@/lib/session";
import { archiveFieldAction, createFieldAction, moveFieldAction, updateFieldAction } from "./actions";

export const metadata: Metadata = { title: "Fields" };

const TYPE_LABELS: Record<(typeof METADATA_FIELD_TYPES)[number], string> = {
  TEXT: "Short text",
  NUMBER: "Number",
  YEAR: "Year",
  YES_NO: "Yes or no",
  SELECT: "Pick one from a list",
  MULTI_SELECT: "Pick several from a list",
};

export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { saved, error } = await searchParams;
  const all = await (await serverApi()).metadata.listFields.query({ includeArchived: true });
  const active = all.filter((f) => !f.archivedAt);
  const archived = all.filter((f) => f.archivedAt);

  return (
    <>
      <PageHeader title="Fields" intro="These are the extra details you can record for each piece, such as species or frame colour. Add your own any time." />
      <Flash saved={saved} error={error} />

      <Card title="Add a field" className="mb-6">
        <form action={createFieldAction}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="new-label">
              <Input id="new-label" name="label" required maxLength={80} placeholder="For example, Wing span" />
            </Field>
            <Field label="Kind of answer" htmlFor="new-type">
              <Select id="new-type" name="type" defaultValue="TEXT">
                {METADATA_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Choices (only for lists)" htmlFor="new-options" hint="One per line. You can also add more choices later while editing a piece.">
            <Textarea id="new-options" name="options" rows={3} />
          </Field>
          <Field label="Help text (optional)" htmlFor="new-help">
            <Input id="new-help" name="helpText" maxLength={300} />
          </Field>
          <Checkbox name="isPublic" label="Show on the public page" defaultChecked />
          <Checkbox name="filterable" label="Let visitors filter by this" />
          <Button type="submit">Add field</Button>
        </form>
      </Card>

      <ul className="space-y-3">
        {active.map((f, i) => {
          const options = (JSON.parse(f.options) as string[]).join("\n");
          const isList = f.type === "SELECT" || f.type === "MULTI_SELECT";
          return (
            <li key={f.id} className="rounded-xl border border-stone bg-parchment p-4">
              <form action={updateFieldAction}>
                <input type="hidden" name="id" value={f.id} />
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor={`label-${f.id}`}>
                    <Input id={`label-${f.id}`} name="label" defaultValue={f.label} required maxLength={80} />
                  </Field>
                  <div className="mb-4">
                    <span className="mb-1 block font-medium text-forest">Kind of answer</span>
                    <Badge>{TYPE_LABELS[f.type]}</Badge>
                  </div>
                </div>
                {isList ? (
                  <Field label="Choices" htmlFor={`opts-${f.id}`} hint="One per line. Removing a choice keeps it on pieces that already use it.">
                    <Textarea id={`opts-${f.id}`} name="options" rows={4} defaultValue={options} />
                  </Field>
                ) : null}
                <Field label="Help text" htmlFor={`help-${f.id}`}>
                  <Input id={`help-${f.id}`} name="helpText" defaultValue={f.helpText} maxLength={300} />
                </Field>
                <div className="flex flex-wrap items-center gap-x-6">
                  <Checkbox name="isPublic" label="Show on the public page" defaultChecked={f.isPublic} />
                  <Checkbox name="filterable" label="Let visitors filter" defaultChecked={f.filterable} />
                  <Button type="submit" variant="secondary" className="ml-auto">
                    Save
                  </Button>
                </div>
              </form>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone pt-2">
                {i > 0 ? (
                  <form action={moveFieldAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button type="submit" variant="ghost" className="min-h-10">
                      Move up
                    </Button>
                  </form>
                ) : null}
                {i < active.length - 1 ? (
                  <form action={moveFieldAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button type="submit" variant="ghost" className="min-h-10">
                      Move down
                    </Button>
                  </form>
                ) : null}
                <details className="ml-auto">
                  <summary className="cursor-pointer rounded-lg px-3 py-2 text-danger">Remove</summary>
                  <form action={archiveFieldAction} className="mt-1 rounded-lg border border-danger bg-dangerbg p-2">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="archived" value="1" />
                    <p className="mb-2 text-sm">This hides the field. What you already entered is kept, and you can bring it back.</p>
                    <Button type="submit" variant="danger" className="min-h-10">
                      Yes, remove it
                    </Button>
                  </form>
                </details>
              </div>
            </li>
          );
        })}
      </ul>

      {archived.length ? (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl text-forest">Removed fields</h2>
          <ul className="divide-y divide-stone rounded-xl border border-stone bg-parchment">
            {archived.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                <span>{f.label}</span>
                <form action={archiveFieldAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="archived" value="0" />
                  <Button type="submit" variant="secondary" className="min-h-10">
                    Bring back
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
