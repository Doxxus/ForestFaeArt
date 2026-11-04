import { SITE_URL } from "./site-config";

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Safe to place inside a script tag: "<" can never start a closing tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");

/** A short plain-text description for search results and link previews. */
export function summarise(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[.,;:\s]+$/, "")}…`;
}

interface OrgInput {
  name: string;
  tagline: string;
  email: string;
  sameAs: string[];
  logoPath: string;
}

export const organizationLd = (o: OrgInput) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: o.name,
  url: SITE_URL,
  logo: absoluteUrl(o.logoPath),
  ...(o.tagline ? { description: o.tagline } : {}),
  ...(o.email ? { email: o.email } : {}),
  ...(o.sameAs.length ? { sameAs: o.sameAs } : {}),
});

interface ProductInput {
  title: string;
  description: string;
  sku: string;
  slug: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  priceCents: number | null;
  currency: string;
  images: string[];
}

const AVAILABILITY = { AVAILABLE: "https://schema.org/InStock", RESERVED: "https://schema.org/LimitedAvailability", SOLD: "https://schema.org/SoldOut" } as const;

/** Offers appear only when the price is public, so hiding a price hides it from search engines too. */
export const productLd = (p: ProductInput) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: p.title,
  sku: p.sku,
  ...(p.description ? { description: summarise(p.description, 300) } : {}),
  ...(p.images.length ? { image: p.images } : {}),
  url: absoluteUrl(`/portfolio/${p.slug}`),
  ...(p.priceCents !== null
    ? { offers: { "@type": "Offer", price: (p.priceCents / 100).toFixed(2), priceCurrency: p.currency, availability: AVAILABILITY[p.status], url: absoluteUrl(`/portfolio/${p.slug}`) } }
    : {}),
});

interface EventInput {
  title: string;
  slug: string;
  description: string;
  startsAt: string | number | Date;
  endsAt: string | number | Date;
  venue: string;
  address: string;
  cancelled: boolean;
  image: string | null;
}

export const eventLd = (e: EventInput) => ({
  "@context": "https://schema.org",
  "@type": "Event",
  name: e.title,
  startDate: new Date(e.startsAt).toISOString(),
  endDate: new Date(e.endsAt).toISOString(),
  eventStatus: e.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  ...(e.venue || e.address ? { location: { "@type": "Place", name: e.venue || e.address, ...(e.address ? { address: e.address } : {}) } } : {}),
  ...(e.description ? { description: summarise(e.description, 300) } : {}),
  ...(e.image ? { image: [e.image] } : {}),
  url: absoluteUrl(`/events/${e.slug}`),
});

/** Escapes text for the sitemap. */
export const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
