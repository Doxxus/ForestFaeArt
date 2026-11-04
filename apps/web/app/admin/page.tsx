import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { STATUS_LABELS, money } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { PRODUCT_STATUSES } from "@ffa/validators";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const summary = await (await serverApi()).inventory.summary.query();
  const owner = user.role === "ADMIN" ? (summary as typeof summary & { totalValueCents: number; totalCostCents: number }) : null;

  return (
    <>
      <PageHeader title={`Hello, ${user.name}`} intro="Here is how the shop looks today.">
        <LinkButton href="/admin/products/new">Add a piece</LinkButton>
      </PageHeader>
      {denied ? <Alert tone="error">That area is for the administrator.</Alert> : null}

      {summary.needsPhotos > 0 ? (
        <Alert tone="info">
          <strong>{summary.needsPhotos}</strong> {summary.needsPhotos === 1 ? "piece needs" : "pieces need"} photos.{" "}
          <Link className="text-forest underline" href="/admin/products?photos=none">
            Take photos
          </Link>
        </Alert>
      ) : null}
      {summary.etsySoldToRemove > 0 ? (
        <Alert tone="error">
          <strong>{summary.etsySoldToRemove}</strong> sold {summary.etsySoldToRemove === 1 ? "piece is" : "pieces are"} still listed on Etsy. Remember to remove{" "}
          {summary.etsySoldToRemove === 1 ? "it" : "them"}.{" "}
          <Link className="text-forest underline" href="/admin/products?etsy=1&status=SOLD">
            See which
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCT_STATUSES.filter((s) => s !== "ARCHIVED").map((s) => (
          <Link key={s} href={`/admin/products?status=${s}`} className="block rounded-xl border border-stone bg-parchment p-4 hover:border-forest">
            <div className="text-3xl font-semibold text-forest">{summary.byStatus[s]}</div>
            <div className="text-moss">{STATUS_LABELS[s]}</div>
          </Link>
        ))}
      </div>

      {owner ? (
        <Card title="Stock value" className="mt-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-moss">At selling price</dt>
              <dd className="text-2xl font-semibold text-forest">{money(owner.totalValueCents)}</dd>
            </div>
            <div>
              <dt className="text-moss">At cost</dt>
              <dd className="text-2xl font-semibold text-forest">{money(owner.totalCostCents)}</dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </>
  );
}
