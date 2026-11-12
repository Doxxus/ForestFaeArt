import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PORTFOLIO_PAGE_SIZE, PORTFOLIO_SORTS, PORTFOLIO_SORT_LABELS, needsTidy, parsePortfolioParams, portfolioHref } from "@ffa/validators";
import { CardGrid, EmptyArt, PageHeader, ProductCard } from "@/components/site/cards";
import { Pagination } from "@/components/site/pagination";
import { Panel } from "@/components/site/world";
import { Button, Input, Select, buttonClass } from "@/components/ui";
import { absoluteUrl } from "@/lib/seo";
import { serverApi } from "@/lib/session";
import { getSite } from "@/lib/site";

type Search = Promise<Record<string, string | string[] | undefined>>;

async function load(searchParams: Search) {
  const params = parsePortfolioParams(await searchParams);
  const [{ settings }, result] = await Promise.all([
    getSite(),
    serverApi().then((api) => api.catalog.search.query({ ...params, pageSize: PORTFOLIO_PAGE_SIZE })),
  ]);
  return { params, settings, result };
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  try {
    const { params, result } = await load(searchParams);
    const category = result?.facets.categories.find((c) => c.slug === params.category);
    // A filtered or searched view is a thin duplicate of the main list, so it stays out of search results.
    const filtered = Boolean(params.q || params.show !== "all" || params.sort !== "newest" || Object.keys(params.filters).length);
    return {
      title: category ? category.name : "Portfolio",
      description: category?.description || "Hand-made insect art, framed and ready to hang.",
      alternates: { canonical: absoluteUrl(portfolioHref({ ...params, q: "", show: "all", sort: "newest", filters: {}, page: params.page })) },
      ...(filtered ? { robots: { index: false, follow: true } } : {}),
    };
  } catch {
    return { title: "Portfolio" };
  }
}

export default async function PortfolioPage({ searchParams }: { searchParams: Search }) {
  const raw = await searchParams;
  // A plain filter form sends every field, even empty ones. Send people to the short, shareable address.
  if (needsTidy(raw)) redirect(portfolioHref(parsePortfolioParams(raw)));
  const { params, settings, result } = await load(searchParams);
  if (!result) notFound();
  const category = result.facets.categories.find((c) => c.slug === params.category);
  const sorts = PORTFOLIO_SORTS.filter((s) => settings.showPrices || (s !== "price-asc" && s !== "price-desc"));
  const hasFilters = Boolean(params.q || params.category || params.show !== "all" || params.sort !== "newest" || Object.keys(params.filters).length);

  return (
    <Panel size="6xl" sprout={{ kind: "cluster", at: "right" }}>
      <PageHeader title={category ? category.name : "Portfolio"} art={["morpho-butterfly", "morpho-butterfly"]}>
        {category?.description ? <p className="mx-auto mt-3 max-w-2xl text-lg text-moss">{category.description}</p> : null}
      </PageHeader>

      <form method="get" action="/portfolio" role="search" aria-label="Search and filter the portfolio" className="mb-8 rounded-xl border border-stone bg-parchment p-4">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="mb-4 sm:col-span-2">
            <label htmlFor="q" className="mb-1 block font-medium text-forest">
              Search
            </label>
            <Input id="q" name="q" type="search" defaultValue={params.q} placeholder="A species, a colour, a word…" maxLength={100} />
          </div>
          <div className="mb-4">
            <label htmlFor="category" className="mb-1 block font-medium text-forest">
              Kind
            </label>
            <Select id="category" name="category" defaultValue={params.category}>
              <option value="">All kinds</option>
              {result.facets.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.count})
                </option>
              ))}
            </Select>
          </div>
          <div className="mb-4">
            <label htmlFor="sort" className="mb-1 block font-medium text-forest">
              Order
            </label>
            <Select id="sort" name="sort" defaultValue={result.sort}>
              {sorts.map((s) => (
                <option key={s} value={s}>
                  {PORTFOLIO_SORT_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="mb-4">
            <label htmlFor="show" className="mb-1 block font-medium text-forest">
              Show
            </label>
            <Select id="show" name="show" defaultValue={params.show}>
              <option value="all">Everything, including sold</option>
              <option value="available">Available now</option>
            </Select>
          </div>
          {result.facets.fields.length > 0 ? (
            <details open={Object.keys(params.filters).length > 0} className="mb-4 sm:col-span-2 lg:col-span-4">
              <summary className="cursor-pointer rounded-md py-2 font-medium text-forest">More ways to narrow it down{Object.keys(params.filters).length ? ` (${Object.keys(params.filters).length} chosen)` : ""}</summary>
              <div className="mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                {result.facets.fields.map((f) => (
                  <div key={f.key} className="mb-4">
                    <label htmlFor={`f-${f.key}`} className="mb-1 block font-medium text-forest">
                      {f.label}
                    </label>
                    <Select id={`f-${f.key}`} name={`f.${f.key}`} defaultValue={params.filters[f.key] ?? ""}>
                      <option value="">Any</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value} ({o.count})
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Show these pieces</Button>
          {hasFilters ? (
            <Link href="/portfolio" className={buttonClass("ghost")}>
              Clear everything
            </Link>
          ) : null}
        </div>
      </form>

      <p role="status" className="mb-4 text-moss">
        {result.total === 0 ? "No pieces to show." : result.total === 1 ? "1 piece" : `${result.total} pieces`}
        {result.pages > 1 ? `, page ${result.page} of ${result.pages}` : ""}
      </p>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-stone bg-parchment p-8 text-center">
          <EmptyArt name="mushrooms" />
          <p className="font-display text-2xl text-forest">Nothing matches just yet.</p>
          <p className="mt-2 text-moss">{hasFilters ? "Try a different word, or clear the filters to see everything." : "New work is on its way. Please check back soon."}</p>
          {hasFilters ? (
            <p className="mt-4">
              <Link href="/portfolio" className={buttonClass("secondary")}>
                Clear everything
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <h2 className="sr-only">Pieces</h2>
          <CardGrid>
            {result.items.map((p) => (
              <ProductCard key={p.sku} piece={p} />
            ))}
          </CardGrid>
        </>
      )}

      <Pagination page={result.page} pages={result.pages} hrefFor={(page) => portfolioHref(params, { page })} />
    </Panel>
  );
}
