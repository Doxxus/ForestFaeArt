import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, Card, PageHeader, buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { wrapUpAction } from "../../actions";

export const metadata: Metadata = { title: "Wrap up event" };

export default async function WrapUpPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const api = await serverApi();
  let event;
  try {
    event = await api.events.get.query({ idOrSlug: slug });
  } catch (e) {
    if (errorCode(e) === "NOT_FOUND") notFound();
    throw e;
  }
  const preview = await api.events.wrapUpPreview.query({ eventId: event.id });

  return (
    <>
      <PageHeader title={`Wrap up ${event.title}`} intro="Check what came back, then confirm. Pieces you didn't sell go back on the shelf." />
      <div className="max-w-2xl space-y-5">
        <Card title={`Going back on the shelf (${preview.unsold.length})`}>
          {preview.unsold.length === 0 ? (
            <p className="text-moss">Nothing to put back.</p>
          ) : (
            <ul className="divide-y divide-stone">
              {preview.unsold.map((p) => (
                <li key={p.productId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {p.title} <span className="text-sm text-moss">{p.sku}</span>
                  </span>
                  <Badge tone="good">Back to {STATUS_LABELS[p.returnsTo].toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {preview.other.length ? (
          <Card title={`Already dealt with (${preview.other.length})`}>
            <ul className="divide-y divide-stone">
              {preview.other.map((p) => (
                <li key={p.productId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {p.title} <span className="text-sm text-moss">{p.sku}</span>
                  </span>
                  <Badge>{STATUS_LABELS[p.status]}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-moss">These stay as they are (for example, sold at the event).</p>
          </Card>
        ) : null}

        {preview.unsold.length === 0 && preview.other.length === 0 ? <Alert tone="info">This event has no pieces to wrap up.</Alert> : null}

        <div className="flex gap-2">
          <form action={wrapUpAction}>
            <input type="hidden" name="id" value={event.id} />
            <input type="hidden" name="slug" value={event.slug} />
            <Button type="submit" disabled={preview.unsold.length === 0 && preview.other.length === 0}>
              Confirm wrap-up
            </Button>
          </form>
          <Link href={`/admin/events/${event.slug}`} className={buttonClass("ghost")}>
            Not yet
          </Link>
        </div>
      </div>
    </>
  );
}
