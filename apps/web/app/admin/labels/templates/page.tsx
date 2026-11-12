import type { Metadata } from "next";
import Link from "next/link";
import { sizeLabel } from "@ffa/validators";
import { TemplateEditor } from "@/components/labels/template-editor";
import { Badge, Button, Card, Flash, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireUser, serverApi } from "@/lib/session";
import { archiveTemplateAction, defaultTemplateAction, duplicateTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Label designs" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { edit, saved, error } = await searchParams;
  const api = await serverApi();
  const [templates, context] = await Promise.all([api.labels.templates.list.query({ includeInactive: true }), api.labels.context.query()]);
  const editing = edit && edit !== "new" ? (templates.find((t) => t.id === edit) ?? null) : null;
  const showEditor = edit === "new" || editing !== null;

  return (
    <>
      <PageHeader title="Label designs" intro="Sizes and layouts for labels. Changing the default only affects labels printed from now on.">
        <LinkButton href="/admin/labels/templates?edit=new">New design</LinkButton>
        <LinkButton href="/admin/labels" variant="secondary">
          Print labels
        </LinkButton>
      </PageHeader>
      <Flash saved={saved} error={error} />

      {showEditor ? (
        <div className="mb-6">
          <TemplateEditor key={editing?.id ?? "new"} template={editing} isTest={context.isTest} baseUrl={context.baseUrl} />
          <p className="mt-3">
            <Link href="/admin/labels/templates" className="font-medium text-forest underline">
              Close the editor
            </Link>
          </p>
        </div>
      ) : null}

      <Card title="All designs">
        <Table label="Label layouts">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Size</Th>
              <Th>Shows</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className={t.active ? undefined : "opacity-60"}>
                <Td>
                  <span className="font-medium text-forest">{t.name}</span>{" "}
                  {t.isDefault ? <Badge tone="good">Default</Badge> : null} {t.active ? null : <Badge>Archived</Badge>}
                </Td>
                <Td>{sizeLabel(t)}</Td>
                <Td>
                  {(["qr", "sku", "title", "price"] as const)
                    .filter((k) => t.show[k])
                    .map((k) => ({ qr: "QR", sku: "SKU", title: "title", price: "price" })[k])
                    .join(", ")}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <LinkButton href={`/admin/labels/templates?edit=${t.id}`} variant="secondary">
                      Edit
                    </LinkButton>
                    <form action={duplicateTemplateAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" variant="secondary">
                        Copy
                      </Button>
                    </form>
                    {t.active && !t.isDefault ? (
                      <form action={defaultTemplateAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button type="submit" variant="secondary">
                          Make default
                        </Button>
                      </form>
                    ) : null}
                    {!t.isDefault ? (
                      <form action={archiveTemplateAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="active" value={t.active ? "0" : "1"} />
                        <Button type="submit" variant="ghost">
                          {t.active ? "Archive" : "Restore"}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
