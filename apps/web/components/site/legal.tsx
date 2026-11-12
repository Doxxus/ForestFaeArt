import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Prose } from "@/components/site/cards";
import { Panel } from "@/components/site/world";
import { errorCode } from "@/lib/api";
import { serverApi } from "@/lib/session";
import { paragraphs } from "@/lib/site";

export async function loadLegal(key: "privacy" | "terms") {
  try {
    return await (await serverApi()).content.publicGet.query({ key });
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
}

/** A plain reading page for a legal document the owner edits in the admin (WEB-12). */
export async function LegalPage({ pageKey }: { pageKey: "privacy" | "terms" }): Promise<ReactNode> {
  const page = await loadLegal(pageKey);
  if (!page) notFound();
  return (
    <Panel size="3xl" sprout={{ kind: "tall", at: "right" }}>
      <h1 className="font-display text-4xl text-forest">{page.title}</h1>
      <div aria-hidden="true" className="mt-3 h-px w-24 bg-copper" />
      <Prose paragraphs={paragraphs(page.body)} className="mt-6 text-lg" />
    </Panel>
  );
}
