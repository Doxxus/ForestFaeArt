import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { PrinterTest } from "@/components/labels/printer-test";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Printer test" };

/** Spike 4 (ADR 013): does direct Bluetooth printing to the NIIMBOT B1 work from this phone? */
export default async function PrinterTestPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Printer test" intro="Try printing straight to the NIIMBOT B1 over Bluetooth, without the NIIMBOT app." />
      <PrinterTest />
    </>
  );
}
