import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return <LegalPage pageKey="terms" />;
}
