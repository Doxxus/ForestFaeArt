import type { Metadata } from "next";
import Link from "next/link";
import { LABEL_SOURCES, type LabelSource } from "@ffa/validators";
import { PrintLabels } from "@/components/labels/print-labels";
import { Alert, Button, Card, Field, Flash, LinkButton, PageHeader, Select } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import type { LabelItemDto } from "@/lib/labels/types";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Print labels" };

type Params = { source?: string; ids?: string | string[]; category?: string; event?: string; saved?: string; error?: string };

const SOURCE_TEXT: Record<LabelSource, string> = {
  ids: "the pieces you chose",
  category: "a category",
  event: "an event",
  unlabelled: "every piece with no label yet",
  stale: "every piece whose label is out of date",
};

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const api = await serverApi();

  const ids = [p.ids ?? []].flat().filter(Boolean);
  const source: LabelSource | null = LABEL_SOURCES.includes(p.source as LabelSource) ? (p.source as LabelSource) : ids.length ? "ids" : p.category ? "category" : p.event ? "event" : null;

  const [context, templates, categories, events] = await Promise.all([
    api.labels.context.query(),
    api.labels.templates.list.query(),
    api.categories.list.query({ includeArchived: false }),
    api.events.list.query({ when: "all", includeArchived: false }),
  ]);

  let items: LabelItemDto[] = [];
  let truncated = false;
  let problem = "";
  if (source) {
    try {
      const selection =
        source === "ids" ? { source, productIds: ids.slice(0, 200) } : source === "category" ? { source, categoryId: p.category ?? "" } : source === "event" ? { source, eventId: p.event ?? "" } : { source };
      const prepared = await api.labels.prepare.query(selection);
      items = prepared.items;
      truncated = prepared.truncated;
    } catch (e) {
      problem = friendlyError(e);
    }
  }

  return (
    <>
      <PageHeader title="Print labels" intro="Choose pieces, check the label, then print on the B1, save pictures for the NIIMBOT app, or make a PDF or an A4 sheet.">
        {user.role === "ADMIN" ? (
          <LinkButton href="/admin/labels/templates" variant="secondary">
            Label designs
          </LinkButton>
        ) : null}
        <LinkButton href="/admin/labels/printer-test" variant="secondary">
          Test the B1 printer
        </LinkButton>
      </PageHeader>
      <Flash saved={p.saved} error={p.error} />

      <Card title="Which pieces?" className="mb-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <LinkButton href="/admin/labels?source=unlabelled" variant={source === "unlabelled" ? "primary" : "secondary"}>
            All with no label yet
          </LinkButton>
          <LinkButton href="/admin/labels?source=stale" variant={source === "stale" ? "primary" : "secondary"}>
            All with an out-of-date label
          </LinkButton>
          <LinkButton href="/admin/products" variant="secondary">
            Pick from the product list
          </LinkButton>
        </div>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <form method="GET" action="/admin/labels" className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="A category" htmlFor="category">
                <Select id="category" name="category" defaultValue={p.category ?? ""} required>
                  <option value="" disabled>
                    Choose a category
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mb-4">
              <Button type="submit" variant="secondary">
                Use this
              </Button>
            </div>
          </form>
          <form method="GET" action="/admin/labels" className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Pieces taken to an event" htmlFor="event">
                <Select id="event" name="event" defaultValue={p.event ?? ""} required>
                  <option value="" disabled>
                    Choose an event
                  </option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.productCount})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mb-4">
              <Button type="submit" variant="secondary">
                Use this
              </Button>
            </div>
          </form>
        </div>
        {source ? (
          <p className="text-moss">
            Showing {SOURCE_TEXT[source]}: {items.length} {items.length === 1 ? "piece" : "pieces"}.{" "}
            <Link href="/admin/labels" className="font-medium text-forest underline">
              Clear
            </Link>
          </p>
        ) : null}
      </Card>

      {problem ? <Alert tone="error">{problem}</Alert> : null}
      {source && !problem && items.length === 0 ? (
        <Alert>{source === "unlabelled" ? "Every piece has a label already." : source === "stale" ? "No labels are out of date. Lovely." : "No pieces to label there."}</Alert>
      ) : null}
      {items.length ? <PrintLabels key={`${source}:${ids.join(",")}:${p.category ?? ""}:${p.event ?? ""}`} items={items} templates={templates} context={context} truncated={truncated} /> : null}
    </>
  );
}
