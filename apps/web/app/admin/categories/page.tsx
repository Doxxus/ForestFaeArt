import type { Metadata } from "next";
import { Badge, Button, Card, Checkbox, Field, Flash, Input, PageHeader } from "@/components/ui";
import { requireUser, serverApi } from "@/lib/session";
import { archiveCategoryAction, createCategoryAction, moveCategoryAction, updateCategoryAction } from "./actions";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { saved, error } = await searchParams;
  const all = await (await serverApi()).categories.list.query({ includeArchived: true });
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);

  return (
    <>
      <PageHeader title="Categories" intro="Group your pieces. A piece can be in more than one category, and archiving a category never removes any pieces." />
      <Flash saved={saved} error={error} />

      <Card title="Add a category" className="mb-6">
        <form action={createCategoryAction} className="grid gap-x-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <Field label="Name" htmlFor="new-name">
            <Input id="new-name" name="name" required maxLength={80} />
          </Field>
          <Field label="Short description (optional)" htmlFor="new-desc">
            <Input id="new-desc" name="description" maxLength={1000} />
          </Field>
          <div className="mb-4">
            <Button type="submit">Add</Button>
          </div>
        </form>
      </Card>

      <ul className="space-y-3">
        {active.map((c, i) => (
          <li key={c.id} className="rounded-xl border border-stone bg-parchment p-4">
            <form action={updateCategoryAction} className="grid gap-x-4 sm:grid-cols-[1fr_2fr]">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Name" htmlFor={`name-${c.id}`}>
                <Input id={`name-${c.id}`} name="name" defaultValue={c.name} required maxLength={80} />
              </Field>
              <Field label="Description" htmlFor={`desc-${c.id}`}>
                <Input id={`desc-${c.id}`} name="description" defaultValue={c.description} maxLength={1000} />
              </Field>
              <div className="flex flex-wrap items-center gap-x-6 sm:col-span-2">
                <Checkbox name="hidden" label="Hide from the website" defaultChecked={c.hidden} />
                <Badge>{c.productCount} {c.productCount === 1 ? "piece" : "pieces"}</Badge>
                <Button type="submit" variant="secondary" className="ml-auto">
                  Save
                </Button>
              </div>
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone pt-2">
              {i > 0 ? (
                <form action={moveCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="direction" value="up" />
                  <Button type="submit" variant="ghost" className="min-h-10">
                    Move up
                  </Button>
                </form>
              ) : null}
              {i < active.length - 1 ? (
                <form action={moveCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="direction" value="down" />
                  <Button type="submit" variant="ghost" className="min-h-10">
                    Move down
                  </Button>
                </form>
              ) : null}
              <details className="ml-auto">
                <summary className="cursor-pointer rounded-lg px-3 py-2 text-danger">Archive</summary>
                <form action={archiveCategoryAction} className="mt-1 rounded-lg border border-danger bg-dangerbg p-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="archived" value="1" />
                  <p className="mb-2 text-sm">
                    {c.productCount > 0 ? `${c.productCount} ${c.productCount === 1 ? "piece is" : "pieces are"} in this category. They stay as they are.` : "No pieces are in this category."} Archive it?
                  </p>
                  <Button type="submit" variant="danger" className="min-h-10">
                    Yes, archive it
                  </Button>
                </form>
              </details>
            </div>
          </li>
        ))}
      </ul>

      {archived.length ? (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl text-forest">Archived</h2>
          <ul className="divide-y divide-stone rounded-xl border border-stone bg-parchment">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <span>{c.name}</span>
                <form action={archiveCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="archived" value="0" />
                  <Button type="submit" variant="secondary" className="min-h-10">
                    Restore
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
