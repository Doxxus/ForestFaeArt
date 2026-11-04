import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Prose } from "@/components/site/cards";
import { Kit } from "@/components/site/kit";
import { errorCode } from "@/lib/api";
import { serverApi } from "@/lib/session";
import { getSite, imageSrc, imageSrcSet, paragraphs } from "@/lib/site";
import { summarise } from "@/lib/seo";

async function load() {
  try {
    return await (await serverApi()).content.publicGet.query({ key: "about" });
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await load();
    return { title: "About", description: page ? summarise(page.body) : undefined };
  } catch {
    return { title: "About" };
  }
}

export default async function AboutPage() {
  const [{ settings }, page] = await Promise.all([getSite(), load()]);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="font-display text-4xl text-forest sm:text-5xl">{page.title}</h1>
        <div aria-hidden="true" className="mx-auto mt-3 h-px w-24 bg-copper" />
      </header>
      <div className={page.imagePath ? "grid items-start gap-8 md:grid-cols-[1fr_1.2fr]" : ""}>
        {page.imagePath ? (
          <img src={imageSrc(page.imagePath, 960)} srcSet={imageSrcSet(page.imagePath, [640, 960, 1280])} sizes="(min-width: 768px) 40vw, 100vw" alt="" width={960} height={1200} loading="eager" decoding="async" className="w-full rounded-xl border border-stone object-cover" />
        ) : null}
        <Prose paragraphs={paragraphs(page.body)} className="text-lg" />
      </div>

      {settings.sourcingStatement ? (
        <section id="sourcing" aria-labelledby="sourcing-heading" className="relative mt-14 scroll-mt-6 overflow-hidden rounded-xl border border-stone bg-parchment p-6 sm:p-8">
          <Kit name="fern" className="absolute -right-4 bottom-0 hidden h-auto w-28 opacity-30 sm:block" />
          <h2 id="sourcing-heading" className="font-display text-2xl text-forest">
            How we source
          </h2>
          <Prose paragraphs={paragraphs(settings.sourcingStatement)} className="mt-3" />
        </section>
      ) : null}
    </div>
  );
}
