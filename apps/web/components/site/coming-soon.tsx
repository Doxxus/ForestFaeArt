import type { SiteSettings } from "@/lib/site";
import { MothMark } from "./kit";
import { Sprout, World, WorldLevel } from "./world";

/** What every public address shows until the owner publishes (WEB-18). No pieces, events or customer data, and it works for a scanned QR label too. */
export function ComingSoon({ settings }: { settings: SiteSettings }) {
  const links = [
    settings.etsyUrl ? { href: settings.etsyUrl, label: "Visit our Etsy shop" } : null,
    settings.instagramUrl ? { href: settings.instagramUrl, label: "Follow us on Instagram" } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);

  return (
    <div className="site-world">
      <World />
      <WorldLevel level="full" />
      <main id="main" className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="panel-wrap panel-wrap-solo max-w-xl">
          <Sprout kind="cluster" at="right" mobile />
          <div className="panel panel-roomy text-center">
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
        </div>
      </main>
    </div>
  );
}
