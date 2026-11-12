import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { NumberedSteps } from "@/components/guide";
import { PrintButton } from "@/components/print-button";
import { STAFF_QUICK_START as Q } from "@/lib/guide";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Quick start for staff" };

/** One page, meant to fit on one sheet of paper. */
export default async function StaffQuickStartPage() {
  await requireUser();
  return (
    <>
      <PageHeader title={Q.title} intro={Q.intro} />
      <div className="no-print mb-4">
        <PrintButton />
      </div>
      <Card title="Selling a piece">
        <NumberedSteps steps={Q.steps} />
      </Card>
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="If something goes wrong">
          <ul className="list-disc space-y-2 pl-5">
            {Q.oops.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Card>
        <Card title="Please don't">
          <ul className="list-disc space-y-2 pl-5">
            {Q.never.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
