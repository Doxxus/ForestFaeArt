import { describe, expect, it } from "vitest";
import { priceLine } from "../lib/format";
import { absoluteUrl, eventLd, jsonLd, organizationLd, productLd, summarise, xml } from "../lib/seo";

const piece = { title: "Luna Moth", description: "A pale green moth.", sku: "FFA-000001", slug: "luna-moth", status: "AVAILABLE" as const, priceCents: 14500, currency: "CAD", images: ["https://img.test/a.jpg"] };

describe("structured data", () => {
  it("never lets text close the script tag it sits in", () => {
    const text = jsonLd({ name: "</script><script>alert(1)</script>", note: "line\u2028break" });
    expect(text).not.toContain("</script>");
    expect(text).not.toContain("<");
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>");
  });

  it("describes a piece with a public price as an offer", () => {
    const ld = productLd(piece) as { offers: { price: string; priceCurrency: string; availability: string; url: string }; sku: string };
    expect(ld.sku).toBe("FFA-000001");
    expect(ld.offers).toMatchObject({ price: "145.00", priceCurrency: "CAD", availability: "https://schema.org/InStock" });
    expect(ld.offers.url).toMatch(/\/portfolio\/luna-moth$/);
  });

  it("leaves the offer out when the price is hidden, so search engines learn no more than visitors", () => {
    expect(productLd({ ...piece, priceCents: null })).not.toHaveProperty("offers");
  });

  it("maps sold and reserved to the right availability", () => {
    expect((productLd({ ...piece, status: "SOLD" }) as { offers: { availability: string } }).offers.availability).toBe("https://schema.org/SoldOut");
    expect((productLd({ ...piece, status: "RESERVED" }) as { offers: { availability: string } }).offers.availability).toBe("https://schema.org/LimitedAvailability");
  });

  it("describes an event, including when it is cancelled", () => {
    const base = { title: "Market", slug: "market", description: "Come along.", startsAt: Date.UTC(2026, 11, 5, 15), endsAt: Date.UTC(2026, 11, 5, 21), venue: "Hall", address: "1 Main St", cancelled: false, image: null };
    expect(eventLd(base)).toMatchObject({ "@type": "Event", eventStatus: "https://schema.org/EventScheduled", startDate: "2026-12-05T15:00:00.000Z" });
    expect(eventLd({ ...base, cancelled: true })).toMatchObject({ eventStatus: "https://schema.org/EventCancelled" });
    expect(eventLd({ ...base, venue: "", address: "" })).not.toHaveProperty("location");
  });

  it("describes the business without empty fields", () => {
    const ld = organizationLd({ name: "Forest Fae Folk Art", tagline: "", email: "", sameAs: [], logoPath: "/kit/mark.svg" });
    expect(ld).not.toHaveProperty("email");
    expect(ld).not.toHaveProperty("sameAs");
    expect(ld).not.toHaveProperty("description");
  });
});

describe("page text helpers", () => {
  it("shortens a description at a word, with an ellipsis", () => {
    expect(summarise("Short one.")).toBe("Short one.");
    const long = summarise("word ".repeat(100), 60);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(summarise("  lots   of\n\nspace ")).toBe("lots of space");
  });

  it("escapes text for the sitemap", () => {
    expect(xml(`a&b <c> "d"`)).toBe("a&amp;b &lt;c&gt; &quot;d&quot;");
  });

  it("builds absolute addresses", () => {
    expect(absoluteUrl("/portfolio")).toMatch(/^https?:\/\/[^/]+\/portfolio$/);
    expect(absoluteUrl("about")).toMatch(/\/about$/);
  });

  it("says the right thing where a price would be", () => {
    expect(priceLine({ status: "AVAILABLE", priceCents: 4500 })).toBe("$45.00");
    expect(priceLine({ status: "AVAILABLE", priceCents: null })).toBe("Inquire for price");
    expect(priceLine({ status: "SOLD", priceCents: 4500 })).toBe("Sold");
    expect(priceLine({ status: "RESERVED", priceCents: 4500 })).toBe("$45.00");
  });
});
