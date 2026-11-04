import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PreviewBanner, SiteFooter, SiteHeader } from "@/components/site/chrome";
import { ComingSoon } from "@/components/site/coming-soon";
import { ANALYTICS_TOKEN, SITE_URL, mayIndex } from "@/lib/site-config";
import { absoluteUrl } from "@/lib/seo";
import { getSite } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const { settings, open } = await getSite();
  const index = open && mayIndex(settings.siteLive);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: settings.businessName, template: `%s | ${settings.businessName}` },
    description: settings.tagline || undefined,
    // Search engines only ever see the real, published site (WEB-18, HAND-0).
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      siteName: settings.businessName,
      type: "website",
      locale: "en_CA",
      images: [{ url: absoluteUrl("/og-default.png"), width: 1200, height: 630, alt: settings.businessName }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { settings, open, preview, user } = await getSite();
  if (!open) return <ComingSoon settings={settings} />;
  return (
    <>
      {preview ? <PreviewBanner /> : null}
      <SiteHeader settings={settings} />
      <main id="main">{children}</main>
      <SiteFooter settings={settings} />
      {/* Counts real visitors only: never staff, and never while the site is still hidden. */}
      {ANALYTICS_TOKEN && settings.siteLive && !user ? <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })} /> : null}
    </>
  );
}
