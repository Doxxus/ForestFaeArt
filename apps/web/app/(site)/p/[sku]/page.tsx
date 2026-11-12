import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyArt } from "@/components/site/cards";
import { Panel } from "@/components/site/world";
import { buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { serverApi } from "@/lib/session";
import { getSite } from "@/lib/site";

export const metadata: Metadata = { title: "Finding your piece", robots: { index: false, follow: false } };

/**
 * The address inside every QR code (ADR 011). It must never break, so it resolves the SKU or any old slug and
 * sends the visitor to the piece's own page. A piece that is not on the website gets a friendly page instead of an error.
 * While the site is unpublished, the layout shows "Coming soon" before this page is reached.
 * The redirect is temporary on purpose: whether a piece is visible can change after its label is printed.
 */
export default async function ScannedLabel({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const { settings } = await getSite();
  let slug: string | null = null;
  try {
    slug = (await (await serverApi()).catalog.get.query({ skuOrSlug: decodeURIComponent(sku) })).slug;
  } catch (error) {
    if (errorCode(error) !== "NOT_FOUND") throw error;
  }
  if (slug) redirect(`/portfolio/${slug}`);

  return (
    <Panel size="xl" className="text-center" sprout={{ kind: "ring", at: "center" }}>
      <EmptyArt name="leaf-sprig" className="h-20" />
      <h1 className="font-display text-3xl text-forest">This piece isn&apos;t on the website yet.</h1>
      <p className="mt-3 text-lg text-moss">
        Thank you for scanning its label. {settings.businessName} is still adding new work, so its page may appear soon. In the meantime, have a look at everything else.
      </p>
      <p className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/portfolio" className={buttonClass("primary", "px-6")}>
          Browse the portfolio
        </Link>
        <Link href="/contact" className={buttonClass("secondary", "px-6")}>
          Ask about a piece
        </Link>
      </p>
    </Panel>
  );
}
