import Link from "next/link";
import type { Metadata } from "next";
import { CardGrid, ProductCard, Prose, SectionHeading } from "@/components/site/cards";
import { EventCard } from "@/components/site/events";
import { Hero } from "@/components/site/hero";
import { Panel, WorldLevel } from "@/components/site/world";
import { buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { jsonLd, organizationLd } from "@/lib/seo";
import { getSite, paragraphs } from "@/lib/site";
import { serverApi } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSite();
  const title = settings.tagline ? `${settings.businessName} | ${settings.tagline}` : settings.businessName;
  return { title: { absolute: title }, description: settings.tagline || undefined, alternates: { canonical: "/" } };
}

export default async function Home() {
  const { settings } = await getSite();
  const api = await serverApi();
  const [featured, categories, events, teaser] = await Promise.all([
    api.catalog.search.query({ sort: "featured", pageSize: 4 }),
    api.catalog.categories.query(),
    api.events.publicList.query({ when: "upcoming" }),
    api.content.publicGet.query({ key: "home_teaser" }).catch((e) => (errorCode(e) === "NOT_FOUND" ? null : Promise.reject(e))),
  ]);
  const pieces = featured?.items ?? [];
  const eventsFocus = settings.storeMode === "EVENT_ONLY";
  const upcoming = events.slice(0, 3);

  const eventsSection =
    upcoming.length > 0 ? (
      <Panel key="events" as="section" aria-labelledby="events-heading" sprout={{ kind: "ring", at: "right", mobile: true }}>
        <SectionHeading id="events-heading" intro="Come and say hello at a market near you.">
          Where to find us
        </SectionHeading>
        <ul className="mx-auto grid max-w-3xl gap-4">
          {upcoming.map((e) => (
            <EventCard key={e.slug} event={e} />
          ))}
        </ul>
        <p className="mt-6 text-center">
          <Link href="/events" className="font-medium text-forest underline underline-offset-4">
            See all events
          </Link>
        </p>
      </Panel>
    ) : null;

  const workSection =
    pieces.length > 0 ? (
      <Panel key="work" as="section" aria-labelledby="work-heading" sprout={{ kind: "cluster", at: "left", mobile: true }}>
        <SectionHeading id="work-heading">{pieces.some((p) => p.featured) ? "Featured work" : "Recent work"}</SectionHeading>
        <CardGrid>
          {pieces.map((p) => (
            <ProductCard key={p.sku} piece={p} />
          ))}
        </CardGrid>
        <p className="mt-8 text-center">
          <Link href="/portfolio" className={buttonClass("secondary")}>
            See the whole portfolio
          </Link>
        </p>
      </Panel>
    ) : null;

  return (
    <>
      <WorldLevel level="full" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationLd({ name: settings.businessName, tagline: settings.tagline, email: settings.publicEmail, sameAs: [settings.instagramUrl, settings.etsyUrl, settings.facebookUrl].filter(Boolean), logoPath: "/kit/mark.svg" })) }} />
      <Hero settings={settings}>
        <Link href={eventsFocus && upcoming.length ? "/events" : "/portfolio"} className={buttonClass("primary", "px-6")}>
          {eventsFocus && upcoming.length ? "Find us at a market" : "Browse the portfolio"}
        </Link>
        <Link href={eventsFocus && upcoming.length ? "/portfolio" : "/about"} className={buttonClass("secondary", "bg-cream/70 px-6")}>
          {eventsFocus && upcoming.length ? "Browse the portfolio" : "Meet the maker"}
        </Link>
      </Hero>

      {eventsFocus ? eventsSection : null}
      {workSection}

      {categories.length > 0 ? (
        <Panel as="section" aria-labelledby="browse-heading" size="4xl" sprout={{ kind: "tall", at: "center" }}>
          <SectionHeading id="browse-heading">Browse by kind</SectionHeading>
          <ul className="flex flex-wrap justify-center gap-3">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/portfolio?category=${c.slug}`} className="lift inline-flex min-h-11 items-center gap-2 rounded-full border border-forest/40 bg-cream px-5 py-2 font-display text-lg text-forest">
                  {c.name}
                  <span className="text-sm text-moss">({c.count})</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {!eventsFocus ? eventsSection : null}

      {teaser ? (
        <Panel as="section" aria-labelledby="about-heading" size="3xl" className="text-center" sprout={{ kind: "ring", at: "left" }}>
          <SectionHeading id="about-heading">{teaser.title}</SectionHeading>
          <Prose paragraphs={paragraphs(teaser.body)} className="mx-auto text-left" />
          <p className="mt-6">
            <Link href="/about" className="font-medium text-forest underline underline-offset-4">
              Read more about the work
            </Link>
          </p>
        </Panel>
      ) : null}
    </>
  );
}
