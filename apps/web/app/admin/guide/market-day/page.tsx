import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Checklist } from "@/components/guide";
import { PrintButton } from "@/components/print-button";
import { MARKET_DAY as M } from "@/lib/guide";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Market day checklist" };

export default async function MarketDayPage() {
  await requireUser();
  return (
    <>
      <PageHeader title={M.title} intro={M.intro} />
      <div className="no-print mb-4">
        <PrintButton />
      </div>
      <div className="rounded-xl border border-stone bg-parchment p-5">
        <Checklist title="Before you go" items={M.before} />
        <Checklist title="At the market" items={M.during} />
        <Checklist title="When you are home" items={M.after} />
      </div>
    </>
  );
}
