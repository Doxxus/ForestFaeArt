import { describe, expect, it } from "vitest";
import { DEFAULT_PORTFOLIO_PARAMS, needsTidy, parsePortfolioParams, portfolioHref } from "./portfolio";

describe("portfolio addresses", () => {
  it("reads every choice from the address", () => {
    expect(parsePortfolioParams({ q: " luna ", category: "moth", show: "available", sort: "price-asc", page: "3", "f.frame_color": "Walnut" })).toEqual({
      q: "luna",
      category: "moth",
      show: "available",
      sort: "price-asc",
      page: 3,
      filters: { frame_color: "Walnut" },
    });
  });

  it("falls back to defaults for anything unexpected, so a mangled link still works", () => {
    expect(parsePortfolioParams({ sort: "random", show: "sold", page: "-4", q: ["a", "b"] })).toEqual({ ...DEFAULT_PORTFOLIO_PARAMS, q: "a" });
    expect(parsePortfolioParams({ page: "abc" }).page).toBe(1);
    expect(parsePortfolioParams({ page: "99999" }).page).toBe(1000);
  });

  it("limits filters and ignores empty ones", () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f.k${i}`, "v"]));
    expect(Object.keys(parsePortfolioParams(many).filters)).toHaveLength(8);
    expect(parsePortfolioParams({ "f.x": "  " }).filters).toEqual({});
  });

  it("builds short links that leave out the defaults", () => {
    expect(portfolioHref(DEFAULT_PORTFOLIO_PARAMS)).toBe("/portfolio");
    expect(portfolioHref(DEFAULT_PORTFOLIO_PARAMS, { category: "moth", page: 2 })).toBe("/portfolio?category=moth&page=2");
    expect(portfolioHref({ ...DEFAULT_PORTFOLIO_PARAMS, q: "a b", filters: { frame_color: "Natural wood" } }, { sort: "title" })).toBe("/portfolio?q=a+b&sort=title&f.frame_color=Natural+wood");
  });

  it("notices addresses that a plain filter form leaves cluttered", () => {
    expect(needsTidy({ q: "moth", category: "", sort: "newest", show: "all", "f.tags": "" })).toBe(true);
    expect(needsTidy({ page: "1" })).toBe(true);
    expect(needsTidy({ q: "moth", sort: "title", show: "available", page: "2", "f.frame_color": "Black" })).toBe(false);
    expect(needsTidy({})).toBe(false);
  });

  it("round-trips through a link", () => {
    const params = { q: "stag & beetle", category: "beetle", show: "available" as const, sort: "featured" as const, page: 4, filters: { insect_type: "Beetle" } };
    const href = portfolioHref(params);
    expect(parsePortfolioParams(Object.fromEntries(new URL(href, "https://x.test").searchParams))).toEqual(params);
  });
});
