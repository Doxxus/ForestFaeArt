import type { ReactNode } from "react";
import type { GuideSection, GuideShot } from "@/lib/guide";

/** Every guide screenshot is taken at the same size, so the page reserves the right space and nothing jumps. */
export const SHOT_SIZE = { width: 1280, height: 800 } as const;

export function GuideFigure({ shot }: { shot: GuideShot }) {
  return (
    <figure className="mt-4 overflow-hidden rounded-lg border border-stone bg-cream print:break-inside-avoid">
      <img src={`/guide/${shot.file}`} alt={shot.alt} width={SHOT_SIZE.width} height={SHOT_SIZE.height} loading="lazy" decoding="async" className="h-auto w-full" />
    </figure>
  );
}

export function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-6 marker:font-medium marker:text-forest">
      {steps.map((s) => (
        <li key={s} className="pl-1">
          {s}
        </li>
      ))}
    </ol>
  );
}

export function Tips({ tips }: { tips: string[] }) {
  return (
    <div className="mt-4 rounded-lg bg-okbg px-4 py-3">
      <p className="font-medium text-forest">Good to know</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function SectionBody({ section }: { section: GuideSection }) {
  return (
    <>
      <p className="mb-3 text-lg">{section.intro}</p>
      {section.steps ? <NumberedSteps steps={section.steps} /> : null}
      {section.tips ? <Tips tips={section.tips} /> : null}
      {section.shot ? <GuideFigure shot={section.shot} /> : null}
    </>
  );
}

/** A list with an empty box in front of each line, for ticking off on paper. */
export function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mb-6 print:break-inside-avoid">
      <h2 className="mb-2 font-display text-2xl text-forest">{title}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-1 inline-block size-5 shrink-0 rounded border-2 border-forest" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PrintHeader({ children }: { children: ReactNode }) {
  return <div className="no-print mb-4 flex flex-wrap items-center gap-3">{children}</div>;
}
