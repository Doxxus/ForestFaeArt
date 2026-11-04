import type { Metadata } from "next";
import { EventCard } from "@/components/site/events";
import { SectionHeading } from "@/components/site/cards";
import { API_URL } from "@/lib/config";
import { serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Events", description: "Markets and shows where you can meet the work in person." };

export default async function EventsPage() {
  const api = await serverApi();
  const [upcoming, past] = await Promise.all([api.events.publicList.query({ when: "upcoming" }), api.events.publicList.query({ when: "past" })]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-10 text-center">
        <h1 className="font-display text-4xl text-forest sm:text-5xl">Events</h1>
        <div aria-hidden="true" className="mx-auto mt-3 h-px w-24 bg-copper" />
        <p className="mx-auto mt-3 max-w-xl text-lg text-moss">Markets and shows where you can meet the work in person.</p>
        {upcoming.length ? (
          <p className="mt-4">
            <a href={`${API_URL}/events.ics`} className="font-medium text-forest underline underline-offset-4">
              Add all upcoming events to your calendar
            </a>
          </p>
        ) : null}
      </header>

      <section aria-labelledby="upcoming-heading">
        <SectionHeading id="upcoming-heading">Coming up</SectionHeading>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-stone bg-parchment p-6 text-center text-moss">No events are planned right now. Check back soon, or follow along on social media for news.</p>
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
