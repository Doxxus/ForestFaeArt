import Link from "next/link";
import { EmptyArt } from "@/components/site/cards";
import { Panel } from "@/components/site/world";
import { buttonClass } from "@/components/ui";

/** Shown inside the site (header and footer included) when a page, piece or event is not found (WEB-11). */
export default function SiteNotFound() {
  return (
    <Panel size="xl" className="text-center" sprout={{ kind: "ring", at: "center" }}>
      <EmptyArt name="spider" className="h-28" />
      <h1 className="font-display text-3xl text-forest">We couldn&apos;t find that page.</h1>
      <p className="mt-3 text-lg text-moss">It may have moved, been sold, or the address may have a typo.</p>
      <p className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/portfolio" className={buttonClass("primary", "px-6")}>
          Browse the portfolio
        </Link>
        <Link href="/" className={buttonClass("secondary", "px-6")}>
          Back to the home page
        </Link>
      </p>
    </Panel>
  );
}
