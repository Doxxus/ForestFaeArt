import Link from "next/link";
import { eventRange } from "@/lib/format";
import { imageSrc, imageSrcSet } from "@/lib/site";

export interface EventCardData {
  title: string;
  slug: string;
  venue: string;
  startsAt: string | number | Date;
  endsAt: string | number | Date;
  timezone: string;
  cancelled: boolean;
  imagePath: string | null;
}

const part = (d: string | number | Date, tz: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz }).format(new Date(d));

/** A small calendar-leaf for the date, like a page torn from a field diary. */
export function DateLeaf({ startsAt, timezone, muted }: { startsAt: EventCardData["startsAt"]; timezone: string; muted?: boolean }) {
  return (
    <div aria-hidden="true" className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-lg border ${muted ? "border-stone bg-stone/40 text-moss" : "border-copper bg-cream text-forest"}`}>
      <span className="text-xs uppercase tracking-widest">{part(startsAt, timezone, { month: "short" })}</span>
      <span className="font-display text-2xl leading-none">{part(startsAt, timezone, { day: "numeric" })}</span>
    </div>
  );
}

export function EventCard({ event, past = false }: { event: EventCardData; past?: boolean }) {
  return (
    <li className="lift overflow-hidden rounded-xl border border-stone bg-parchment">
      <Link href={`/events/${event.slug}`} className="flex gap-4 rounded-xl p-4">
        {event.imagePath ? (
          <img src={imageSrc(event.imagePath, 320)} srcSet={imageSrcSet(event.imagePath, [320, 640])} sizes="96px" alt="" width={96} height={96} loading="lazy" decoding="async" className="hidden size-24 shrink-0 rounded-lg object-cover sm:block" />
        ) : null}
        <DateLeaf startsAt={event.startsAt} timezone={event.timezone} muted={past || event.cancelled} />
        <div className="min-w-0">
          <h3 className="font-display text-xl text-forest">
            {event.title}
            {event.cancelled ? <span className="ml-2 rounded-full bg-dangerbg px-2.5 py-0.5 align-middle font-sans text-sm text-danger">Cancelled</span> : null}
          </h3>
          <p className="mt-1 text-moss">{eventRange(event.startsAt, event.endsAt, event.timezone)}</p>
          {event.venue ? <p className="text-ink">{event.venue}</p> : null}
        </div>
      </Link>
    </li>
  );
}
