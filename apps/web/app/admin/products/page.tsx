import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_STATUSES, type ProductStatus } from "@ffa/validators";
import { PhotoPlaceholder } from "@/components/placeholder";
import { Badge, Button, Card, Field, Input, LinkButton, PageHeader, Select, buttonClass } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { STATUS_LABELS, STATUS_TONE, money, photoUrl } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 25;
const SORTS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["title", "Title A to Z"],
  ["price_high", "Price, high to low"],
  ["price_low", "Price, low to high"],
  ["sku", "SKU"],
] as const;

type Params = { q?: string; status?: string; photos?: string; etsy?: string; category?: string; labels?: string; sort?: string; offset?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const p = await searchParams;
  const api = await serverApi();

  const status = PRODUCT_STATUSES.includes(p.status as ProductStatus) ? (p.status as ProductStatus) : undefined;
  const sort = SORTS.some(([v]) => v === p.sort) ? (p.sort as (typeof SORTS)[number][0]) : "newest";
  const offset = Math.max(0, Number.parseInt(p.offset ?? "0", 10) || 0);

  const [list, categories] = await Promise.all([
    api.products.list.query({
      q: p.q || undefined,
      status: status ? [status] : undefined,
      hasPhoto: p.photos === "none" ? false : p.photos === "has" ? true : undefined,
      listedOnEtsy: p.etsy === "1" ? true : undefined,
      categoryId: p.category || undefined,
      labelState: p.labels === "NONE" || p.labels === "STALE" ? p.labels : undefined,
      sort,
      limit: PAGE_SIZE,
      offset,
    }),
    api.categories.list.query({ includeArchived: false }),
  ]);

  const query = (over: Partial<Params>) => {
    const merged = { ...p, ...over };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, String(v));
    const text = qs.toString();
    return `/admin/products${text ? `?${text}` : ""}`;
  };
  const filtered = Boolean(p.q || status || p.photos || p.etsy || p.category || p.labels);

  return (
    <>
      <PageHeader title="Products" intro={`${list.total} ${list.total === 1 ? "piece" : "pieces"}${filtered ? " match your search" : ""}.`}>
        <LinkButton href="/admin/products/new">Add a piece</LinkButton>
      </PageHeader>

      <Card className="mb-5">
        <form method="GET">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Search" htmlFor="q">
                <Input id="q" name="q" type="search" defaultValue={p.q ?? ""} placeholder="Title or SKU" />
              </Field>
            </div>
            <div className="mb-4 flex gap-2">
              <Button type="submit">Search</Button>
              {filtered ? (
                <Link href="/admin/products" className={buttonClass("ghost")}>
                  Clear
                </Link>
              ) : null}
            </div>
          </div>
          <details open={Boolean(status || p.photos || p.etsy || p.category || p.labels || (p.sort && p.sort !== "newest"))}>
            <summary className="mb-3 cursor-pointer py-2 font-medium text-forest">More filters and sorting</summary>
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue={status ?? ""}>
                  <option value="">Everything except archived</option>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Photos" htmlFor="photos">
                <Select id="photos" name="photos" defaultValue={p.photos ?? ""}>
                  <option value="">All</option>
                  <option value="none">Needs photos</option>
                  <option value="has">Has photos</option>
                </Select>
              </Field>
              <Field label="Category" htmlFor="category">
                <Select id="category" name="category" defaultValue={p.category ?? ""}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sort by" htmlFor="sort">
                <Select id="sort" name="sort" defaultValue={sort}>
                  {SORTS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Etsy" htmlFor="etsy">
                <Select id="etsy" name="etsy" defaultValue={p.etsy ?? ""}>
                  <option value="">All</option>
                  <option value="1">Also listed on Etsy</option>
                </Select>
              </Field>
              <Field label="Labels" htmlFor="labels">
                <Select id="labels" name="labels" defaultValue={p.labels ?? ""}>
                  <option value="">All</option>
                  <option value="NONE">No label printed yet</option>
                  <option value="STALE">Label out of date</option>
                </Select>
              </Field>
            </div>
          </details>
        </form>
      </Card>

      {list.items.length === 0 ? (
        <Card>
          <p className="text-moss">{filtered ? "Nothing matches that search." : "No pieces yet. Add your first one, or import your spreadsheet from Import."}</p>
        </Card>
      ) : (
        <form method="GET" action="/admin/labels">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary">
              Print labels for the ticked pieces
            </Button>
            <span className="text-sm text-moss">Tick pieces below, or use Labels in the menu to print many at once.</span>
          </div>
          <ul className="divide-y divide-stone overflow-hidden rounded-xl border border-stone bg-parchment">
            {list.items.map((item) => (
              <li key={item.id} className="flex items-center">
                <label className="flex min-h-16 shrink-0 cursor-pointer items-center pl-3 pr-1">
                  <input type="checkbox" name="ids" value={item.id} className="size-5 accent-forest" aria-label={`Select ${item.title} for labels`} />
                </label>
                <Link href={`/admin/products/${item.sku}`} className="flex min-w-0 flex-1 items-center gap-3 p-3 hover:bg-cream sm:gap-4">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-stone bg-cream sm:size-20">
                    {item.thumbnailPath ? (
                      <img src={photoUrl(API_URL, item.thumbnailPath, 320)} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <PhotoPlaceholder className="size-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-medium text-forest">{item.title}</div>
                    <div className="text-sm text-moss">
                      {item.sku}
                      {item.quantity > 1 ? ` · ${item.quantity} in stock` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      {item.isSample ? <Badge tone="warn">Sample</Badge> : null}
                      {item.imageCount === 0 ? <Badge tone="warn">Needs photos</Badge> : null}
                      {item.labelState === "STALE" ? <Badge tone="bad">Label out of date</Badge> : null}
                      {item.listedOnEtsy ? <Badge>On Etsy</Badge> : null}
                      {item.featured ? <Badge>Featured</Badge> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-lg font-semibold text-forest">{money(item.priceCents)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </form>
      )}

      {list.total > PAGE_SIZE ? (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-between">
          {offset > 0 ? (
            <Link href={query({ offset: String(Math.max(0, offset - PAGE_SIZE)) })} className={buttonClass("secondary")}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-moss">
            {offset + 1} to {Math.min(offset + PAGE_SIZE, list.total)} of {list.total}
          </span>
          {offset + PAGE_SIZE < list.total ? (
            <Link href={query({ offset: String(offset + PAGE_SIZE) })} className={buttonClass("secondary")}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
