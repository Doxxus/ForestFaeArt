import Link from "next/link";
import type { ReactNode } from "react";
import { PhotoPlaceholder } from "@/components/placeholder";
import { priceLine } from "@/lib/format";
import { imageSrc, imageSrcSet } from "@/lib/site";

export interface CardPiece {
  sku: string;
  slug: string;
  title: string;
  excerpt: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  priceCents: number | null;
  featured?: boolean;
  image: { path: string; altText: string } | null;
}

const SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

export function ProductCard({ piece }: { piece: CardPiece }) {
  return (
    <li className="lift group overflow-hidden rounded-xl border border-stone bg-parchment">
      <Link href={`/portfolio/${piece.slug}`} className="block rounded-xl">
        <div className="relative aspect-[4/5] overflow-hidden bg-stone/40">
          {piece.image ? (
            <img
              src={imageSrc(piece.image.path, 640)}
              srcSet={imageSrcSet(piece.image.path, [320, 640, 960])}
              sizes={SIZES}
              alt={piece.image.altText || piece.title}
              width={640}
              height={800}
              loading="lazy"
              decoding="async"
              className={`size-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${piece.status === "SOLD" ? "opacity-80 saturate-50" : ""}`}
            />
          ) : (
            <PhotoPlaceholder className="size-full" />
          )}
          {piece.status !== "AVAILABLE" ? (
            <span className="absolute left-3 top-3 rounded-full border border-forest/40 bg-cream/95 px-3 py-1 font-display text-sm uppercase tracking-widest text-forest">
              {piece.status === "SOLD" ? "Sold" : "Reserved"}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <h3 className="font-display text-xl leading-snug text-forest">{piece.title}</h3>
          {piece.excerpt ? <p className="mt-1 line-clamp-2 text-moss">{piece.excerpt}</p> : null}
          <p className="mt-2 font-medium text-copperdeep">{priceLine(piece)}</p>
        </div>
      </Link>
    </li>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">{children}</ul>;
}

/** A heading with a little flourish beneath it, used to open sections. */
export function SectionHeading({ id, children, intro }: { id?: string; children: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h2 id={id} className="font-display text-3xl text-forest sm:text-4xl">
        {children}
      </h2>
      <div aria-hidden="true" className="mx-auto mt-3 h-px w-24 bg-copper" />
      {intro ? <p className="mx-auto mt-3 max-w-xl text-moss">{intro}</p> : null}
    </div>
  );
}

/** Paragraphs from plain text. Nothing the owner types is ever treated as markup. */
export function Prose({ paragraphs: list, className = "" }: { paragraphs: string[]; className?: string }) {
  return (
    <div className={`prose-fae ${className}`}>
      {list.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
