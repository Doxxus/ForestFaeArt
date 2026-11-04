import Link from "next/link";

/** Numbered pages as ordinary links, so every page can be shared and reached from the keyboard. */
export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (page: number) => string }) {
  if (pages <= 1) return null;
  const nums = new Set<number>([1, pages, page, page - 1, page + 1, page - 2, page + 2]);
  const shown = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  shown.forEach((n, i) => {
    if (i > 0 && n - shown[i - 1]! > 1) items.push("gap");
    items.push(n);
  });
  const base = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3";
  return (
    <nav aria-label="Pages of results" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={`${base} border-forest text-forest hover:bg-parchment`}>
          Previous
        </Link>
      ) : null}
      {items.map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-moss">
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={`${base} border-forest bg-forest text-cream`}>
            <span className="sr-only">Page </span>
            {n}
          </span>
        ) : (
          <Link key={n} href={hrefFor(n)} className={`${base} border-stone text-forest hover:bg-parchment`}>
            <span className="sr-only">Page </span>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={`${base} border-forest text-forest hover:bg-parchment`}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
