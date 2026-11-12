import type { Metadata } from "next";
import Link from "next/link";
import { Badge, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { eventRange, photoUrl } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Events" };

const TABS = [
  ["upcoming", "Coming up"],
  ["past", "Past"],
  ["archived", "Archived"],
] as const;

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ show?: string; saved?: string; error?: string }> }) {
  const user = await requireUser();
  const { show: rawShow, saved, error } = await searchParams;
  const show = TABS.some(([v]) => v === rawShow) ? (rawShow as (typeof TABS)[number][0]) : "upcoming";
  const api = await serverApi();
  const all = await api.events.list.query({ when: show === "archived" ? "all" : show, includeArchived: show === "archived" });
  const items = show === "archived" ? all.filter((e) => e.archived) : all;

  return (
    <>
      <PageHeader title="Events" intro="Markets, fairs and shows. Take pieces to an event and the shop keeps track of what's there.">
        {user.role === "ADMIN" ? <LinkButton href="/admin/events/new">Add an event</LinkButton> : null}
      </PageHeader>
      {saved ? <p role="status" className="mb-4 rounded-lg border border-moss bg-okbg px-4 py-3 text-forest">{saved === "1" ? "Saved." : saved}</p> : null}
      {error ? <p role="alert" className="mb-4 rounded-lg border border-danger bg-dangerbg px-4 py-3 text-danger">{error}</p> : null}

      <nav aria-label="Which events" className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([value, label]) => (
          <Link key={value} href={`/admin/events?show=${value}`} aria-current={show === value ? "page" : undefined} className={buttonClass(show === value ? "primary" : "secondary")}>
            {label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-moss">{show === "upcoming" ? "No events coming up yet." : show === "past" ? "No past events yet." : "Nothing archived."}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/events/${e.slug}`} className="flex h-full gap-3 rounded-xl border border-stone bg-parchment p-3 hover:border-forest">
                <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-stone bg-cream">
                  {e.imagePath ? <img src={photoUrl(API_URL, e.imagePath, 320)} alt="" loading="lazy" className="size-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-medium text-forest">{e.title}</div>
                  <div className="text-sm text-moss">{eventRange(e.startsAt, e.endsAt, e.timezone)}</div>
                  {e.venue ? <div className="truncate text-sm">{e.venue}</div> : null}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={e.status === "PUBLISHED" ? "good" : e.status === "CANCELLED" ? "bad" : "neutral"}>
                      {e.status === "PUBLISHED" ? "Published" : e.status === "CANCELLED" ? "Cancelled" : "Draft"}
                    </Badge>
                    {e.productCount ? <Badge>{e.productCount} {e.productCount === 1 ? "piece" : "pieces"} there</Badge> : null}
                    {e.isSample ? <Badge tone="warn">Sample</Badge> : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
