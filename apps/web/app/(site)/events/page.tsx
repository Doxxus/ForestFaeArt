import type { Metadata } from "next";
import { EventCard } from "@/components/site/events";
import { EmptyArt, PageHeader, SectionHeading } from "@/components/site/cards";
import { API_URL } from "@/lib/config";
import { serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Events", description: "Markets and shows where you can meet the work in person." };

export default async function EventsPage() {
  const api = await serverApi();
  const [upcoming, past] = await Promise.all([api.events.publicList.query({ when: "upcoming" }), api.events.publicList.query({ when: "past" })]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title="Events" art={["cicada", "dragonfly"]} className="mb-10">
        <p className="mx-auto mt-3 max-w-xl text-lg text-moss">Markets and shows where you can meet the work in person.</p>
        {upcoming.length ? (
          <p className="mt-4">
            <a href={`${API_URL}/events.ics`} className="font-medium text-forest underline underline-offset-4">
              Add all upcoming events to your calendar
            </a>
          </p>
        ) : null}
      </PageHeader>

      <section aria-labelledby="upcoming-heading">
        <SectionHeading id="upcoming-heading">Coming up</SectionHeading>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-stone bg-parchment p-6 text-center">
            <EmptyArt name="centipede" className="h-12" />
            <p className="text-moss">No events are planned right now. Check back soon, or follow along on social media for news.</p>
          </div>
        ) : (
          <ol className="grid gap-4">
            {upcoming.map((e) => (
              <EventCard key={e.slug} event={e} />
            ))}
          </ol>
        )}
      </section>

      {past.length ? (
        <section aria-labelledby="past-heading" className="mt-14">
          <SectionHeading id="past-heading">Where we&apos;ve been</SectionHeading>
          <ol className="grid gap-4">
            {past.map((e) => (
              <EventCard key={e.slug} event={e} past />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
