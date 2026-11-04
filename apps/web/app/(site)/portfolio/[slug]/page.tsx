import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CardGrid, ProductCard, Prose, SectionHeading } from "@/components/site/cards";
import { Gallery, type GalleryImage } from "@/components/site/gallery";
import { InquiryForm } from "@/components/site/inquiry-form";
import { PhotoPlaceholder } from "@/components/placeholder";
import { Alert, Badge, buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { priceLine } from "@/lib/format";
import { absoluteUrl, jsonLd, productLd, summarise } from "@/lib/seo";
import { serverApi } from "@/lib/session";
import { getSite, imageSrc, imageSrcSet, paragraphs } from "@/lib/site";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ ok?: string; ask?: string }>;

async function load(slug: string) {
  try {
    return await (await serverApi()).catalog.get.query({ skuOrSlug: slug });
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const piece = await load((await params).slug);
    if (!piece) return { title: "Piece not found" };
    const photo = piece.images[0];
    return {
      title: piece.title,
      description: summarise(piece.description || `${piece.title}, hand-made insect art.`),
      alternates: { canonical: absoluteUrl(`/portfolio/${piece.slug}`) },
      openGraph: { title: piece.title, type: "website", url: absoluteUrl(`/portfolio/${piece.slug}`), ...(photo ? { images: [{ url: imageSrc(photo.path, 1280), alt: photo.altText || piece.title }] } : {}) },
      twitter: { card: photo ? "summary_large_image" : "summary" },
    };
  } catch {
    return { title: "Portfolio" };
  }
}

export default async function ProductPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const { ok, ask } = await searchParams;
  const [{ settings }, piece] = await Promise.all([getSite(), load(slug)]);
  if (!piece) notFound();
  // An old address or a SKU lands on the piece's current, canonical address.
  if (piece.slug !== slug) permanentRedirect(`/portfolio/${piece.slug}`);

  const images: GalleryImage[] = piece.images.map((i) => ({
    src: imageSrc(i.path, 960),
    srcSet: imageSrcSet(i.path, [640, 960, 1280]),
    large: imageSrc(i.path, 1920),
    thumb: imageSrc(i.path, 320),
    alt: i.altText || piece.title,
    width: i.width,
    height: i.height,
  }));
  const hasProvenance = piece.metadata.some((m) => /provenance|sourcing/i.test(m.label) && !/note/i.test(m.label));
  const etsy = piece.etsyUrl;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productLd({ title: piece.title, description: piece.description, sku: piece.sku, slug: piece.slug, status: piece.status, priceCents: piece.priceCents, currency: piece.currency, images: piece.images.slice(0, 4).map((i) => imageSrc(i.path, 1280)) })) }} />
      <nav aria-label="Breadcrumb" className="mb-5 text-moss">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <Link href="/portfolio" className="underline underline-offset-4">
              Portfolio
            </Link>
          </li>
          {piece.categories[0] ? (
            <li className="flex gap-2">
              <span aria-hidden="true">/</span>
              <Link href={`/portfolio?category=${piece.categories[0].slug}`} className="underline underline-offset-4">
                {piece.categories[0].name}
              </Link>
            </li>
          ) : null}
          <li className="flex gap-2">
            <span aria-hidden="true">/</span>
            <span aria-current="page">{piece.title}</span>
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {images.length ? (
          <div className="mx-auto w-full max-w-xl lg:max-w-none">
            <Gallery images={images} title={piece.title} />
          </div>
        ) : (
          <div className="mx-auto aspect-[4/5] w-full max-w-xl overflow-hidden rounded-xl border border-stone lg:max-w-none">
            <PhotoPlaceholder className="size-full" />
          </div>
        )}

        <div>
          <h1 className="font-display text-4xl leading-tight text-forest">{piece.title}</h1>
          <p className="mt-1 text-sm text-moss">Piece {piece.sku}</p>
          <p className="mt-4 flex flex-wrap items-center gap-3 text-2xl text-copperdeep">
            <span>{priceLine(piece)}</span>
            {piece.status === "RESERVED" ? <Badge tone="warn">Reserved for someone</Badge> : null}
            {piece.status === "SOLD" ? <Badge>Sold</Badge> : null}
            {piece.remaining !== null ? <Badge tone="good">Only {piece.remaining} left</Badge> : null}
          </p>

          {piece.description ? <Prose paragraphs={paragraphs(piece.description)} className="mt-5 text-lg" /> : null}

          {piece.metadata.length ? (
            <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-stone py-4">
              {piece.metadata.map((m) => (
                <div key={m.label} className="contents">
                  <dt className="text-moss">{m.label}</dt>
                  <dd className="text-ink">{Array.isArray(m.value) ? m.value.join(", ") : typeof m.value === "boolean" ? (m.value ? "Yes" : "No") : String(m.value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {piece.categories.length ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Kinds">
              {piece.categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/portfolio?category=${c.slug}`} className="inline-block rounded-full border border-forest/40 px-3 py-1 text-forest hover:bg-parchment">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {hasProvenance && settings.sourcingStatement ? (
            <p className="mt-5 rounded-lg bg-parchment p-4 text-moss">
              {settings.sourcingStatement}{" "}
              <Link href="/about#sourcing" className="font-medium text-forest underline underline-offset-4">
                How we source
              </Link>
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {piece.status !== "SOLD" ? (
              <a href="#ask" className={buttonClass("primary", "px-6")}>
                Ask about this piece
              </a>
            ) : (
              <a href="#ask" className={buttonClass("secondary", "px-6")}>
                Ask about similar work
              </a>
            )}
            {etsy ? (
              <a href={etsy} rel="noopener" className={buttonClass("secondary", "px-6")}>
                Also on Etsy
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <section id="ask" aria-labelledby="ask-heading" className="mx-auto mt-14 max-w-2xl scroll-mt-6 rounded-xl border border-stone bg-parchment p-5 sm:p-8">
        <h2 id="ask-heading" className="font-display text-2xl text-forest">
          {piece.status === "SOLD" ? "Interested in something similar?" : "Ask about this piece"}
        </h2>
        <p className="mb-5 mt-1 text-moss">Write to us and we&apos;ll reply by email. Your message mentions {piece.title} ({piece.sku}) so we know which piece you mean.</p>
        {ok === "1" ? <Alert tone="success">Thank you! Your message is on its way. We&apos;ll write back soon.</Alert> : null}
        {ok === "0" ? <Alert tone="error">{ask || "We couldn't send your message. Please try again."}</Alert> : null}
        <InquiryForm sku={piece.sku} returnTo={`/portfolio/${piece.slug}`} submitLabel="Send my question" />
      </section>

      {piece.related.length ? (
        <section aria-labelledby="related-heading" className="mt-16">
          <SectionHeading id="related-heading">You might also like</SectionHeading>
          <CardGrid>
            {piece.related.map((r) => (
              <ProductCard key={r.sku} piece={r} />
            ))}
          </CardGrid>
        </section>
      ) : null}
    </div>
  );
}
