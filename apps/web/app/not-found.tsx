import Link from "next/link";
import { Kit, MothMark } from "@/components/site/kit";
import { buttonClass } from "@/components/ui";

/** A page that was not found, in the brand style (WEB-11). Standalone, so it also works for addresses outside the site. */
export default function NotFound() {
  return (
    <main id="main" className="hero flex min-h-[70vh] items-center justify-center px-6 py-16">
      <Kit name="corner" className="hero-art left-0 top-0 w-20 sm:w-32" eager />
      <Kit name="corner" className="hero-art bottom-0 right-0 w-20 -scale-100 sm:w-32" eager />
      <div className="relative max-w-lg rounded-xl border border-forest/30 bg-cream/90 px-6 py-10 text-center">
        <MothMark className="mx-auto size-14" />
        <h1 className="mt-4 font-display text-3xl text-forest">We couldn&apos;t find that page.</h1>
        <p className="mt-3 text-lg text-moss">It may have moved, or the address may have a typo. Like a good moth, it may simply have flown off.</p>
        <p className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClass("primary", "px-6")}>
            Back to the home page
          </Link>
          <Link href="/portfolio" className={buttonClass("secondary", "px-6")}>
            Browse the portfolio
          </Link>
        </p>
      </div>
    </main>
  );
}
