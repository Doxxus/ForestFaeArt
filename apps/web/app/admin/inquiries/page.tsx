import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader, buttonClass } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Inquiries" };

const TABS = [
  ["NEW", "New"],
  ["REPLIED", "Replied"],
  ["ARCHIVED", "Archived"],
] as const;

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireUser({ admin: true });
  const { show: raw } = await searchParams;
  const show = TABS.find(([v]) => v === raw)?.[0] ?? "NEW";
  const list = await (await serverApi()).inquiries.list.query({ status: show, limit: 50, offset: 0 });

  return (
    <>
      <PageHeader title="Inquiries" intro="Messages from your website. Every one is saved here, even if an email goes astray." />
      <nav aria-label="Which messages" className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([value, label]) => (
          <Link key={value} href={`/admin/inquiries?show=${value}`} aria-current={show === value ? "page" : undefined} className={buttonClass(show === value ? "primary" : "secondary")}>
            {label}
          </Link>
        ))}
      </nav>
      {list.items.length === 0 ? (
        <p className="text-moss">{show === "NEW" ? "No new messages. You're all caught up." : "Nothing here."}</p>
      ) : (
        <ul className="divide-y divide-stone overflow-hidden rounded-xl border border-stone bg-parchment">
          {list.items.map((i) => (
            <li key={i.id}>
              <Link href={`/admin/inquiries/${i.id}`} className="block p-4 hover:bg-cream">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-medium text-forest">{i.name}</span>
                  <span className="text-sm text-moss">{i.email}</span>
                  {i.emailDeliveryStatus === "FAILED" ? <Badge tone="bad">Email didn&apos;t send</Badge> : null}
                  {i.emailDeliveryStatus === "PENDING" ? <Badge tone="warn">Email waiting</Badge> : null}
                  <span className="ml-auto text-sm text-moss">{dateTime(i.createdAt)}</span>
                </div>
                {i.productTitle ? <p className="text-sm text-copperdeep">About: {i.productTitle} ({i.sku})</p> : null}
                <p className="mt-1 text-ink">{i.preview}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.total > 50 ? <p className="mt-3 text-sm text-moss">Showing the newest 50 of {list.total}.</p> : null}
    </>
  );
}
