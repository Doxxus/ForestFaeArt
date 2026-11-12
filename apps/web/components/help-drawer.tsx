"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { helpFor } from "@/lib/help";

/** The "?" button in the header and the drawer it opens (ADM-1). A native dialog gives focus trapping and Esc to close. */
export function HelpDrawer() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const topic = helpFor(pathname);

  // Moving to another page closes the drawer, so it never shows help for the page you have left.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-cream hover:bg-moss"
      >
        <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border border-champagne text-sm font-semibold">
          ?
        </span>
        Help
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          // Browsers close a dialog on Escape by themselves. This makes it certain, whatever is focused inside.
          if (event.key === "Escape") {
            event.preventDefault();
            dialog.current?.close();
          }
        }}
        onClose={() => opener.current?.focus()}
        className="m-0 ml-auto h-full max-h-none w-full max-w-md overflow-y-auto bg-cream p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <div className="flex min-h-full flex-col p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="font-display text-2xl text-forest">
              {topic.title}
            </h2>
            <form method="dialog">
              <button type="submit" className="min-h-11 rounded-lg border border-forest px-4 font-medium text-forest hover:bg-parchment">
                Close
              </button>
            </form>
          </div>
          <p className="mb-4 text-lg">{topic.about}</p>
          {topic.steps?.length ? (
            <section aria-labelledby={`${titleId}-do`} className="mb-4">
              <h3 id={`${titleId}-do`} className="mb-2 font-semibold text-forest">
                What to do
              </h3>
              <ol className="list-decimal space-y-2 pl-6">
                {topic.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          ) : null}
          {topic.tips?.length ? (
            <section aria-labelledby={`${titleId}-good`} className="mb-4 rounded-xl border border-stone bg-parchment p-4">
              <h3 id={`${titleId}-good`} className="mb-2 font-semibold text-forest">
                Good to know
              </h3>
              <ul className="list-disc space-y-2 pl-5">
                {topic.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="mt-auto pt-4 text-sm text-moss">Nothing you do here is ever deleted for good. Pieces and events are archived, and you can bring them back.</p>
        </div>
      </dialog>
    </>
  );
}
