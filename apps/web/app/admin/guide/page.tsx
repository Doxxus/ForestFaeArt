import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { SectionBody } from "@/components/guide";
import { PrintButton } from "@/components/print-button";
import { OWNER_GUIDE } from "@/lib/guide";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Owner Guide" };

export default async function GuidePage() {
  await requireUser({ admin: true });
  return (
    <>
      <PageHeader title="Owner Guide" intro="Everything you need to run your shop and website, in plain words. Use the list to jump to a part." />
      <div className="no-print mb-6 flex flex-wrap gap-3">
        <Link href="/admin/guide/staff" className="inline-flex min-h-11 items-center rounded-lg bg-forest px-4 py-2 font-medium text-cream hover:bg-moss">
          Quick start for staff
        </Link>
        <Link href="/admin/guide/market-day" className="inline-flex min-h-11 items-center rounded-lg border border-forest px-4 py-2 font-medium text-forest hover:bg-parchment">
          Market day checklist
        </Link>
        <PrintButton label="Print the whole guide" />
      </div>

      <nav aria-label="In this guide" className="no-print mb-8 rounded-xl border border-stone bg-parchment p-4">
        <h2 className="mb-2 font-display text-xl text-forest">In this guide</h2>
        <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {OWNER_GUIDE.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-block rounded py-1 text-forest underline underline-offset-4">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-6">
        {OWNER_GUIDE.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-6 print:break-inside-avoid-page">
            <Card>
              <h2 id={`${s.id}-h`} className="mb-2 font-display text-2xl text-forest">
                {i + 1}. {s.title}
              </h2>
              <SectionBody section={s} />
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
