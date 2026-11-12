import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateLeaf } from "@/components/site/events";
import { Prose } from "@/components/site/cards";
import { Panel } from "@/components/site/world";
import { buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { eventRange } from "@/lib/format";
import { absoluteUrl, eventLd, jsonLd, summarise } from "@/lib/seo";
import { serverApi } from "@/lib/session";
import { imageSrc, imageSrcSet, paragraphs } from "@/lib/site";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  try {
    return await (await serverApi()).events.publicGet.query({ slug });
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const e = await load((await params).slug);
    if (!e) return { title: "Event not found" };
    return {
      title: e.title,
      description: summarise(e.description || `${e.title}: ${eventRange(e.startsAt, e.endsAt, e.timezone)}${e.venue ? ` at ${e.venue}` : ""}.`),
      alternates: { canonical: absoluteUrl(`/events/${e.slug}`) },
      openGraph: { title: e.title, type: "website", ...(e.imagePath ? { images: [{ url: imageSrc(e.imagePath, 1280) }] } : {}) },
    };
  } catch {
    return { title: "Events" };
  }
}

/** "10:00" to "10:00 a.m." in the Canadian style. */
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
};
const dayName = (date: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export default async function EventPage({ params }: { params: Params }) {
  const { slug } = await params;
  const e = await load(slug);
  if (!e) notFound();
  const finished = new Date(e.endsAt).getTime() < Date.now();
  const openDays = e.hours.filter((h) => h.open && h.close);

  return (
    <Panel size="4xl" sprout={{ kind: "tall", at: "right" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(eventLd({ ...e, image: e.imagePath ? imageSrc(e.imagePath, 1280) : null })) }} />
      <p className="mb-5">
        <Link href="/events" className="text-moss underline underline-offset-4">
          All events
        </Link>
      </p>
      <article>
        <header className="flex items-start gap-4">
          <DateLeaf startsAt={e.startsAt} timezone={e.timezone} muted={finished || e.cancelled} />
          <div>
            <h1 className="font-display text-4xl leading-tight text-forest">{e.title}</h1>
            <p className="mt-1 text-lg text-moss">{eventRange(e.startsAt, e.endsAt, e.timezone)}</p>
            {e.cancelled ? <p className="mt-2 inline-block rounded-full bg-dangerbg px-3 py-1 font-medium text-danger">This event has been cancelled.</p> : null}
            {finished && !e.cancelled ? <p className="mt-2 inline-block rounded-full bg-stone px-3 py-1 text-ink">This event has finished.</p> : null}
          </div>
        </header>

        {e.imagePath ? (
          <img src={imageSrc(e.imagePath, 1280)} srcSet={imageSrcSet(e.imagePath, [640, 960, 1280, 1920])} sizes="(min-width: 896px) 896px, 100vw" alt="" width={1280} height={720} loading="eager" decoding="async" className="mt-6 max-h-96 w-full rounded-xl border border-stone object-cover" />
        ) : null}

        <div className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
          <div>
            {e.description ? <Prose paragraphs={paragraphs(e.description)} className="text-lg" /> : <p className="text-moss">More details will be added soon.</p>}
            {openDays.length ? (
              <section aria-labelledby="hours-heading" className="mt-8">
                <h2 id="hours-heading" className="mb-2 font-display text-2xl text-forest">
                  Opening hours
                </h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                  {openDays.map((h) => (
                    <div key={h.date} className="contents">
                      <dt className="text-moss">{dayName(h.date)}</dt>
                      <dd>
                        {clock(h.open!)} to {clock(h.close!)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4 rounded-xl border border-stone bg-parchment p-5" aria-label="Where and how">
            {e.venue || e.address ? (
              <div>
                <h2 className="font-display text-xl text-forest">Where</h2>
                {e.venue ? <p>{e.venue}</p> : null}
                {e.address ? <p className="text-moss">{e.address}</p> : null}
                {e.mapUrl ? (
                  <p className="mt-1">
                    <a href={e.mapUrl} rel="noopener" className="font-medium text-forest underline underline-offset-4">
                      Open in maps
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
            {!finished && !e.cancelled ? (
              <p>
                <a href={`${API_URL}/events/${e.slug}.ics`} className={buttonClass("secondary", "w-full")}>
                  Add to my calendar
                </a>
              </p>
            ) : null}
            {e.websiteUrl ? (
              <p>
                <a href={e.websiteUrl} rel="noopener" className="font-medium text-forest underline underline-offset-4">
                  Event website
                </a>
              </p>
            ) : null}
          </aside>
        </div>
      </article>
    </Panel>
  );
}
