/** Portfolio sorting, shared by the API (which sorts) and the website (which shows the choices and builds the links). */
export const PORTFOLIO_SORTS = ["newest", "featured", "price-asc", "price-desc", "title"] as const;
export type PortfolioSort = (typeof PORTFOLIO_SORTS)[number];

export const PORTFOLIO_SORT_LABELS: Record<PortfolioSort, string> = {
  newest: "Newest first",
  featured: "Featured first",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
  title: "Title, A to Z",
};

export const PORTFOLIO_PAGE_SIZE = 12;

export interface PortfolioParams {
  q: string;
  category: string;
  show: "all" | "available";
  sort: PortfolioSort;
  page: number;
  /** Field key to the chosen value. */
  filters: Record<string, string>;
}

export const DEFAULT_PORTFOLIO_PARAMS: PortfolioParams = { q: "", category: "", show: "all", sort: "newest", page: 1, filters: {} };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads the address of the portfolio page. Anything unexpected falls back to a default, so a mangled link still works. */
export function parsePortfolioParams(raw: RawParams): PortfolioParams {
  const sort = first(raw.sort);
  const page = Number.parseInt(first(raw.page), 10);
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("f.")) continue;
    const v = first(value).trim();
    if (v && Object.keys(filters).length < 8) filters[key.slice(2).slice(0, 60)] = v.slice(0, 120);
  }
  return {
    q: first(raw.q).trim().slice(0, 100),
    category: first(raw.category).trim().slice(0, 80),
    show: first(raw.show) === "available" ? "available" : "all",
    sort: (PORTFOLIO_SORTS as readonly string[]).includes(sort) ? (sort as PortfolioSort) : "newest",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 1000) : 1,
    filters,
  };
}

/** True when the address carries empty or default values (a plain filter form sends all of them), so the page can send people to the short form. */
export function needsTidy(raw: RawParams): boolean {
  return Object.entries(raw).some(([key, value]) => {
    const v = first(value);
    return v === "" || (key === "sort" && v === "newest") || (key === "show" && v === "all") || (key === "page" && v === "1");
  });
}

/** The address for a portfolio view. Defaults are left out so shared links stay short. */
export function portfolioHref(params: PortfolioParams, change: Partial<PortfolioParams> = {}): string {
  const p = { ...params, ...change };
  const out = new URLSearchParams();
  if (p.q) out.set("q", p.q);
  if (p.category) out.set("category", p.category);
  if (p.show !== "all") out.set("show", p.show);
  if (p.sort !== "newest") out.set("sort", p.sort);
  for (const [key, value] of Object.entries(p.filters)) if (value) out.set(`f.${key}`, value);
  if (p.page > 1) out.set("page", String(p.page));
  const qs = out.toString();
  return qs ? `/portfolio?${qs}` : "/portfolio";
}
