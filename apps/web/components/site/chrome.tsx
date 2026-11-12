import Link from "next/link";
import type { SiteSettings } from "@/lib/site";
import { Kit, MothMark } from "./kit";
import { Sprout } from "./world";

// Fixed positions (not random) so the server and browser always agree.
const FIREFLIES = [
  { l: "7%", t: "22%", s: "9s", d: "0s", dx: "18px", dy: "-22px" },
  { l: "21%", t: "64%", s: "11s", d: "2s", dx: "-16px", dy: "-18px" },
  { l: "38%", t: "30%", s: "8s", d: "4s", dx: "22px", dy: "-14px" },
  { l: "55%", t: "72%", s: "12s", d: "1s", dx: "-20px", dy: "-26px" },
  { l: "68%", t: "26%", s: "10s", d: "5s", dx: "16px", dy: "-20px" },
  { l: "82%", t: "58%", s: "9.5s", d: "3s", dx: "-18px", dy: "-16px" },
  { l: "93%", t: "34%", s: "11.5s", d: "6s", dx: "14px", dy: "-24px" },
];

const NAV = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/events", label: "Events" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader({ settings }: { settings: SiteSettings }) {
  return (
    <header className="border-b border-stone bg-cream">
      <a href="#main" className="skip-link">
        Skip to the content
      </a>
      <div className="mx-auto flex max-w-6xl items-center gap-x-4 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-md py-1" aria-label={`${settings.businessName}, home`}>
          <MothMark className="size-9 shrink-0" />
          <span className="truncate font-display text-sm uppercase tracking-[0.1em] text-forest min-[420px]:text-lg min-[420px]:tracking-[0.14em] sm:text-xl">{settings.businessName}</span>
        </Link>
        <nav aria-label="Main" className="ml-auto hidden gap-1 md:flex">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-forest hover:bg-parchment">
              {l.label}
            </Link>
          ))}
        </nav>
        {/* A details menu on small screens needs no JavaScript. */}
        <details className="ml-auto md:hidden">
          <summary className="cursor-pointer rounded-md px-3 py-2 text-forest">Menu</summary>
          <nav aria-label="Main" className="absolute inset-x-0 z-20 mt-2 flex flex-col border-y border-stone bg-cream px-4 py-2 shadow-md">
            {NAV.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-3 py-3 text-forest hover:bg-parchment">
                {l.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const links = [
    settings.instagramUrl ? { href: settings.instagramUrl, label: "Instagram" } : null,
    settings.etsyUrl ? { href: settings.etsyUrl, label: "Etsy shop" } : null,
    settings.facebookUrl ? { href: settings.facebookUrl, label: "Facebook" } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);

  return (
    <footer className="floor text-champagne">
      <div className="floor-edge" aria-hidden="true" />
      <Sprout kind="ring" at="left" mobile />
      <Sprout kind="tall" at="right" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {FIREFLIES.map((f) => (
          <span key={f.l} className="firefly" style={{ left: f.l, top: f.t, ["--t" as string]: f.s, ["--d" as string]: f.d, ["--dx" as string]: f.dx, ["--dy" as string]: f.dy }} />
        ))}
      </div>
      <Kit name="divider-vine-light" className="relative mx-auto -mt-px h-auto w-full max-w-xl opacity-90" />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-10 pt-6 sm:grid-cols-3">
        <div>
          <p className="font-display text-xl uppercase tracking-[0.14em] text-cream">{settings.businessName}</p>
          {settings.tagline ? <p className="mt-2 max-w-xs">{settings.tagline}</p> : null}
        </div>
        <nav aria-label="Footer">
          <h2 className="mb-2 font-display text-lg text-cream">Explore</h2>
          <ul className="space-y-1">
            {[...NAV, { href: "/about#sourcing", label: "How we source" }, { href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-block rounded py-1 underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-2 font-display text-lg text-cream">Find us</h2>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} rel="noopener" className="inline-block rounded py-1 underline-offset-4 hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
            {settings.publicEmail ? (
              <li>
                <a href={`mailto:${settings.publicEmail}`} className="inline-block rounded py-1 underline-offset-4 hover:underline">
                  {settings.publicEmail}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      <p className="border-t border-moss px-4 py-4 text-center text-sm">
        © {new Date().getFullYear()} {settings.businessName}. Every piece is made by hand.{" "}
        <Link href="/login" className="underline-offset-4 hover:underline">
          Owner sign in
        </Link>
      </p>
    </footer>
  );
}

/** Shown to signed-in staff while the site is unpublished, so nobody mistakes the preview for the live site. */
export function PreviewBanner() {
  return (
    <div role="status" className="bg-champagne px-4 py-2 text-center text-copperdeep">
      <strong>Preview.</strong> Visitors can&apos;t see this website yet. They see a &ldquo;Coming soon&rdquo; page until you press &ldquo;Publish my website&rdquo;.{" "}
      <Link href="/admin/settings" className="font-medium underline">
        Back to settings
      </Link>
    </div>
  );
}
