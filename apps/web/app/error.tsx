"use client";

import { MothMark } from "@/components/site/kit";

/** Something went wrong on our side. Plain, kind and calm (WEB-11). Never shows technical details. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="max-w-lg rounded-xl border border-stone bg-parchment px-6 py-10 text-center">
        <MothMark className="mx-auto size-14" />
        <h1 className="mt-4 font-display text-3xl text-forest">Something went wrong.</h1>
        <p className="mt-3 text-lg text-moss">It&apos;s on our side, not yours. Please try again in a moment.</p>
        <p className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-lg bg-forest px-6 py-2 font-medium text-cream hover:bg-moss">
            Try again
          </button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-forest px-6 py-2 font-medium text-forest hover:bg-cream">
            Back to the home page
          </a>
        </p>
      </div>
    </main>
  );
}
