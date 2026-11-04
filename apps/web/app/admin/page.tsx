import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_STATUSES } from "@ffa/validators";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { eventRange, STATUS_LABELS, money } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

interface Item {
  tone: "info" | "error";
  text: string;
  href: string;
  action: string;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const isAdmin = user.role === "ADMIN";
  const api = await serverApi();
  const [summary, attention, upcoming] = await Promise.all([
    api.inventory.summary.query(),
    api.site.attention.query(),
    api.events.list.query({ when: "upcoming", includeArchived: false }),
  ]);
  const owner = isAdmin ? (summary as typeof summary & { totalValueCents: number; totalCostCents: number }) : null;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const items: Item[] = [];
  if (isAdmin && attention.newInquiries) items.push({ tone: "info", text: `${plural(attention.newInquiries, "new message", "new messages")} from your website.`, href: "/admin/inquiries", action: "Read" });
  if (isAdmin && attention.failedEmails) items.push({ tone: "error", text: `${plural(attention.failedEmails, "email", "emails")} didn't send.`, href: "/admin/inquiries", action: "See which" });
  if (attention.etsySoldToRemove) items.push({ tone: "error", text: `${plural(attention.etsySoldToRemove, "sold piece is", "sold pieces are")} still listed on Etsy. Remember to remove ${attention.etsySoldToRemove === 1 ? "it" : "them"}.`, href: "/admin/products?etsy=1&status=SOLD", action: "See which" });
  if (attention.piecesNeedingPhotos) items.push({ tone: "info", text: `${plural(attention.piecesNeedingPhotos, "piece needs", "pieces need")} photos.`, href: "/admin/products?photos=none", action: "Take photos" });
  if (attention.reservedPieces) items.push({ tone: "info", text: `${plural(attention.reservedPieces, "piece is", "pieces are")} reserved for someone.`, href: "/admin/products?status=RESERVED", action: "See which" });
  if (attention.draftPieces) items.push({ tone: "info", text: `${plural(attention.draftPieces, "piece is", "pieces are")} still a draft.`, href: "/admin/products?status=DRAFT", action: "Finish them" });
  if (attention.photosMissingAlt) items.push({ tone: "info", text: `${plural(attention.photosMissingAlt, "photo has", "photos have")} no description for screen readers.`, href: "/admin/products?photos=has", action: "Add them" });
  if (isAdmin && attention.draftPages.length) items.push({ tone: "info", text: `${plural(attention.draftPages.length, "website page still has", "website pages still have")} placeholder text.`, href: "/admin/website", action: "Write them" });

  return (
    <>
      <PageHeader title={`Hello, ${user.name}`} intro="Here is how the shop looks today.">
        <LinkButton href="/admin/products/new">Add a piece</LinkButton>
        {isAdmin ? (
          <LinkButton href="/admin/events/new" variant="secondary">
            Add an event
          </LinkButton>
        ) : null}
      </PageHeader>
      {denied ? <Alert tone="error">That area is for the administrator.</Alert> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCT_STATUSES.filter((s) => s !== "ARCHIVED").map((s) => (
          <Link key={s} href={`/admin/products?status=${s}`} className="block rounded-xl border border-stone bg-parchment p-4 hover:border-forest">
            <div className="text-3xl font-semibold text-forest">{summary.byStatus[s]}</div>
            <div className="text-moss">{STATUS_LABELS[s]}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Needs your attention">
          {items.length === 0 ? (
            <p className="text-moss">Nothing needs doing. Lovely.</p>
          ) : (
            <ul className="divide-y divide-stone">
              {items.map((i) => (
                <li key={i.text} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={i.tone === "error" ? "text-danger" : undefined}>{i.text}</span>
                  <Link href={i.href} className="shrink-0 rounded-md px-2 py-1 font-medium text-forest underline">
                    {i.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Coming up">
          {upcoming.length === 0 ? (
            <p className="text-moss">No events planned yet.</p>
          ) : (
            <ul className="divide-y divide-stone">
              {upcoming.slice(0, 4).map((e) => (
                <li key={e.id} className="py-2">
                  <Link href={`/admin/events/${e.slug}`} className="font-medium text-forest underline">
                    {e.title}
                  </Link>{" "}
                  {e.status === "DRAFT" ? <Badge>Draft</Badge> : e.status === "CANCELLED" ? <Badge tone="bad">Cancelled</Badge> : null}
                  <div className="text-sm text-moss">{eventRange(e.startsAt, e.endsAt, e.timezone)}</div>
                  {e.productCount ? <div className="text-sm">{plural(e.productCount, "piece", "pieces")} going</div> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {owner ? (
        <Card title="Stock value" className="mt-5">
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
