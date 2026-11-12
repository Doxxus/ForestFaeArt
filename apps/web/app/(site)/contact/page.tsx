import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Prose } from "@/components/site/cards";
import { InquiryForm } from "@/components/site/inquiry-form";
import { Panel } from "@/components/site/world";
import { Alert } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { serverApi } from "@/lib/session";
import { getSite, paragraphs } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: "Get in touch about a piece, a commission or an event." };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ ok?: string; ask?: string }> }) {
  const { ok, ask } = await searchParams;
  const [{ settings }, page] = await Promise.all([
    getSite(),
    serverApi()
      .then((api) => api.content.publicGet.query({ key: "contact" }))
      .catch((e) => (errorCode(e) === "NOT_FOUND" ? null : Promise.reject(e))),
  ]);
  if (!page) notFound();
  const links = [
    settings.instagramUrl ? { href: settings.instagramUrl, label: "Instagram" } : null,
    settings.etsyUrl ? { href: settings.etsyUrl, label: "Etsy shop" } : null,
    settings.facebookUrl ? { href: settings.facebookUrl, label: "Facebook" } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);

  return (
    <Panel size="5xl" sprout={{ kind: "tall", at: "left" }}>
      <PageHeader title={page.title} art={["wildflowers", "atlas-moth"]} />
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <div>
          <Prose paragraphs={paragraphs(page.body)} className="text-lg" />
          <ul className="mt-6 space-y-2">
            {settings.publicEmail ? (
              <li>
                <span className="text-moss">Email: </span>
                <a href={`mailto:${settings.publicEmail}`} className="font-medium text-forest underline underline-offset-4">
                  {settings.publicEmail}
                </a>
              </li>
            ) : null}
            {settings.businessPhone ? (
              <li>
                <span className="text-moss">Phone: </span>
                <a href={`tel:${settings.businessPhone.replace(/[^\d+]/g, "")}`} className="font-medium text-forest underline underline-offset-4">
                  {settings.businessPhone}
                </a>
              </li>
            ) : null}
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} rel="noopener" className="font-medium text-forest underline underline-offset-4">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <section id="ask" aria-labelledby="contact-form-heading" className="scroll-mt-6 rounded-xl border border-stone bg-parchment p-5 sm:p-8">
          <h2 id="contact-form-heading" className="mb-4 font-display text-2xl text-forest">
            Send a message
          </h2>
          {ok === "1" ? <Alert tone="success">Thank you! Your message is on its way. We&apos;ll write back soon.</Alert> : null}
          {ok === "0" ? <Alert tone="error">{ask || "We couldn't send your message. Please try again."}</Alert> : null}
          <InquiryForm returnTo="/contact" />
        </section>
      </div>
    </Panel>
  );
}
