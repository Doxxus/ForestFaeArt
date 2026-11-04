import type { Metadata } from "next";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { ImportWizard } from "./import-wizard";
import { UndoButton } from "./undo-button";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  await requireUser({ admin: true });
  const batches = await (await serverApi()).import.batches.query();

  return (
    <>
      <PageHeader title="Import your inventory" intro="Bring in a spreadsheet of pieces you already have. You'll see a preview first, and you can undo an import afterwards." />

      <Card title="How to prepare your spreadsheet" className="mb-6">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Download the{" "}
            <a className="text-forest underline" href="/admin/import/template" download>
              template
            </a>{" "}
            and open it in Excel or Google Sheets. It has two example rows.
          </li>
          <li>Each piece is one row. Only <strong>title</strong> and <strong>price</strong> are required.</li>
          <li>Put several categories or tags in one cell separated by a semicolon, like <code>Butterfly; Framed</code>.</li>
          <li>Give every row its own <strong>external_id</strong> (any number or code). Then importing the same file twice never makes duplicates.</li>
          <li>Save as <strong>CSV (UTF-8)</strong>, then choose the file below.</li>
        </ol>
      </Card>

      <div className="mb-8">
        <ImportWizard />
      </div>

      <h2 className="mb-3 font-display text-2xl text-forest">Past imports</h2>
      {batches.length === 0 ? (
        <p className="text-moss">Nothing imported yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>File</Th>
              <Th>Added</Th>
              <Th>Problems</Th>
              <Th>&nbsp;</Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap">{dateTime(b.createdAt)}</Td>
                <Td>{b.filename}</Td>
                <Td>
                  {b.createdCount}
                  {b.updatedCount ? ` (+${b.updatedCount} updated)` : ""}
                </Td>
                <Td>{b.errorCount}</Td>
                <Td>{b.status === "UNDONE" ? <Badge tone="neutral">Undone</Badge> : b.createdCount > 0 ? <UndoButton batchId={b.id} count={b.createdCount} /> : null}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-sm text-moss">
        Undoing an import archives the pieces it added. Nothing is deleted, and you can find them under Status &gt; Archived.
      </p>
    </>
  );
}
