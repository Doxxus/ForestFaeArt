import type { SiteSettings } from "@/lib/site";
import { Kit, MothMark } from "./kit";

/** What every public address shows until the owner publishes (WEB-18). No pieces, events or customer data, and it works for a scanned QR label too. */
export function ComingSoon({ settings }: { settings: SiteSettings }) {
  const links = [
    settings.etsyUrl ? { href: settings.etsyUrl, label: "Visit our Etsy shop" } : null,
    settings.instagramUrl ? { href: settings.instagramUrl, label: "Follow us on Instagram" } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);

  return (
    <main id="main" className="hero flex min-h-screen items-center justify-center px-6 py-16">
      <Kit name="corner" className="hero-art left-0 top-0 w-24 sm:w-40" eager />
      <Kit name="corner" className="hero-art right-0 top-0 w-24 -scale-x-100 sm:w-40" eager />
      <Kit name="corner" className="hero-art bottom-0 left-0 w-24 -scale-y-100 sm:w-40" eager />
      <Kit name="corner" className="hero-art bottom-0 right-0 w-24 -scale-100 sm:w-40" eager />
      <div className="relative max-w-xl rounded-xl border border-forest/30 bg-cream/85 px-6 py-10 text-center shadow-sm sm:px-12">
        <MothMark className="mx-auto size-16" />
        <h1 className="foil mt-4 font-display text-4xl uppercase tracking-[0.12em] sm:text-5xl">{settings.businessName}</h1>
        <p className="mt-4 font-display text-2xl text-forest">Our website is almost ready.</p>
        <p className="mx-auto mt-3 max-w-md text-lg">
          Handmade insect art is on its way here. If you scanned a label on a piece, thank you. The page for it will be waiting for you soon.
        </p>
        {links.length ? (
          <ul className="mt-6 flex flex-wrap justify-center gap-3">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} rel="noopener" className="inline-flex min-h-11 items-center rounded-lg border border-forest px-4 py-2 font-medium text-forest hover:bg-parchment">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
