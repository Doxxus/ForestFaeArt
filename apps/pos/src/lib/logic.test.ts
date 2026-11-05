import { describe, expect, it } from "vitest";
import { looseSku, parseScan } from "./scan";
import { applySale, applySales, findBySku, piecesAtEvent, searchPieces, sellability } from "./catalog";
import { addToCart, removeFromCart, setQuantity, viewCart } from "./cart";
import type { Catalog, Piece } from "../types";

let n = 0;
const piece = (over: Partial<Piece> = {}): Piece => {
  n += 1;
  return { id: `P${n}`, sku: `FFA-${String(n).padStart(6, "0")}`, title: `Piece ${n}`, priceCents: 4500, status: "AVAILABLE", quantity: 1, listedOnEtsy: false, thumbnailKey: null, reservedFor: null, reservedNote: null, eventIds: [], ...over };
};
const catalog = (pieces: Piece[]): Catalog => ({ serverTime: 0, businessName: "Forest Fae Folk Art", paymentMethods: ["CASH", "CARD"], taxRegistered: false, events: [], activeEventId: null, pieces });

describe("reading a scan", () => {
  it("finds the SKU in the label address", () => {
    expect(parseScan("https://forestfae.ca/p/FFA-000123")).toBe("FFA-000123");
    expect(parseScan("https://staging.forestfae.ca/p/ffa-000123?utm=x")).toBe("FFA-000123");
    expect(parseScan("  FFA-000007 ")).toBe("FFA-000007");
    expect(parseScan("FFA000007")).toBe("FFA-000007");
  });
  it("ignores codes that aren't ours", () => {
    expect(parseScan("https://example.com/p/ABC-123")).toBeNull();
    expect(parseScan("https://example.com/?x=FFA-0001234")).toBeNull();
    expect(parseScan("XFFA-000123")).toBeNull();
    expect(parseScan("")).toBeNull();
    expect(parseScan("9780306406157")).toBeNull();
  });
  it("understands a SKU typed loosely", () => {
    expect(looseSku("123")).toBe("FFA-000123");
    expect(looseSku("ffa 45")).toBe("FFA-000045");
    expect(looseSku("FFA-000045")).toBe("FFA-000045");
    expect(looseSku("morpho")).toBeNull();
    expect(looseSku("1234567")).toBeNull();
  });
});

describe("whether a piece can be sold (POS-3)", () => {
  it("allows available and at-event pieces", () => {
    expect(sellability(piece())).toEqual({ level: "ok" });
    expect(sellability(piece({ status: "AT_EVENT" }))).toEqual({ level: "ok" });
  });
  it("asks before selling a reserved piece, naming who it is for", () => {
    expect(sellability(piece({ status: "RESERVED", reservedFor: "Jo Park", reservedNote: "Saturday" }))).toEqual({ level: "confirm", message: "Reserved for Jo Park. Saturday" });
    expect(sellability(piece({ status: "RESERVED" }))).toMatchObject({ level: "confirm" });
  });
  it("blocks sold, draft, archived and awaiting-payment pieces with a clear reason", () => {
    for (const status of ["SOLD", "DRAFT", "ARCHIVED", "PENDING_PAYMENT"] as const) {
      const s = sellability(piece({ status, quantity: status === "SOLD" ? 0 : 1 }));
      expect(s.level).toBe("blocked");
      expect("message" in s && s.message.length > 10).toBe(true);
    }
  });
  it("blocks more than is in stock", () => {
    expect(sellability(piece({ quantity: 2 }), 3)).toEqual({ level: "blocked", message: "Only 2 left." });
    expect(sellability(piece({ quantity: 0 }))).toMatchObject({ level: "blocked" });
  });
});

describe("finding pieces (POS-8)", () => {
  const a = piece({ title: "Blue Morpho Frame" });
  const b = piece({ title: "Atlas Moth", eventIds: ["E1"] });
  const c = piece({ title: "Morpho Earrings", status: "SOLD", quantity: 0 });
  const cat = catalog([a, b, c]);
  it("looks up by exact SKU", () => {
    expect(findBySku(cat, a.sku.toLowerCase())?.id).toBe(a.id);
    expect(findBySku(cat, "FFA-999999")).toBeNull();
    expect(findBySku(null, a.sku)).toBeNull();
  });
  it("searches titles by every word, ignoring case, accents and punctuation, with sellable pieces first", () => {
    expect(searchPieces(cat, "morpho").map((p) => p.id)).toEqual([a.id, c.id]);
    expect(searchPieces(cat, "BLUE, morpho!").map((p) => p.id)).toEqual([a.id]);
    expect(searchPieces(cat, "zzz")).toEqual([]);
    const accented = catalog([piece({ title: "Papillon Éclatant" })]);
    expect(searchPieces(accented, "eclatant")).toHaveLength(1);
  });
  it("finds a SKU however it is typed", () => {
    expect(searchPieces(cat, String(Number(b.sku.slice(4)))).map((p) => p.id)).toEqual([b.id]);
  });
  it("lists the event's pieces when nothing is typed", () => {
    expect(searchPieces(cat, "", { eventId: "E1" }).map((p) => p.id)).toEqual([b.id]);
    expect(searchPieces(cat, "")).toEqual([]);
    expect(piecesAtEvent(cat, "E1").map((p) => p.id)).toEqual([b.id]);
    expect(piecesAtEvent(cat, null)).toEqual([]);
  });
});

describe("taking a sale off the phone's stock", () => {
  it("sells out a unique piece and reduces a multiple", () => {
    const one = piece();
    const many = piece({ quantity: 5 });
    const after = applySale(catalog([one, many]), [{ productId: one.id, quantity: 1 }, { productId: many.id, quantity: 2 }]);
    expect(after.pieces.find((p) => p.id === one.id)).toMatchObject({ quantity: 0, status: "SOLD" });
    expect(after.pieces.find((p) => p.id === many.id)).toMatchObject({ quantity: 3, status: "AVAILABLE" });
  });
  it("applies several waiting sales, never going below zero", () => {
    const p = piece({ quantity: 2 });
    const after = applySales(catalog([p]), [{ items: [{ productId: p.id, quantity: 2 }] }, { items: [{ productId: p.id, quantity: 1 }] }]);
    expect(after.pieces[0]).toMatchObject({ quantity: 0, status: "SOLD" });
  });
});

describe("the cart (POS-9, POS-15)", () => {
  it("adds a piece, and adds to the same line for more of one", () => {
    const p = piece({ quantity: 3 });
    const one = addToCart([], p);
    expect(one).toEqual({ ok: true, cart: [{ productId: p.id, quantity: 1 }] });
    const two = addToCart(one.ok ? one.cart : [], p);
    expect(two).toEqual({ ok: true, cart: [{ productId: p.id, quantity: 2 }] });
  });
  it("stops at the stock and says so", () => {
    const p = piece();
    const first = addToCart([], p);
    const again = addToCart(first.ok ? first.cart : [], p);
    expect(again).toMatchObject({ ok: false });
    expect(!again.ok && again.message).toMatch(/already have 1/);
    expect(addToCart([], piece({ status: "SOLD", quantity: 0 }))).toMatchObject({ ok: false });
  });
  it("sets a quantity, within stock, and removes at zero", () => {
    const p = piece({ quantity: 4 });
    const cart = [{ productId: p.id, quantity: 1 }];
    expect(setQuantity(cart, p, 3)).toEqual({ ok: true, cart: [{ productId: p.id, quantity: 3 }] });
    expect(setQuantity(cart, p, 5)).toMatchObject({ ok: false });
    expect(setQuantity(cart, p, 0)).toEqual({ ok: true, cart: [] });
    expect(removeFromCart(cart, p.id)).toEqual([]);
  });
  it("totals the cart and flags reserved, blocked and Etsy pieces", () => {
    const a = piece({ priceCents: 1000, quantity: 3 });
    const reserved = piece({ priceCents: 2500, status: "RESERVED", reservedFor: "Jo" });
    const etsy = piece({ priceCents: 500, listedOnEtsy: true });
    const gone = piece({ status: "SOLD", quantity: 0 });
    const byId = new Map([a, reserved, etsy, gone].map((p) => [p.id, p]));
    const view = viewCart([{ productId: a.id, quantity: 2 }, { productId: reserved.id, quantity: 1 }, { productId: etsy.id, quantity: 1 }, { productId: gone.id, quantity: 1 }, { productId: "missing", quantity: 1 }], byId, 300);
    expect(view.lines).toHaveLength(4);
    expect(view.totals).toEqual({ ok: true, subtotalCents: 2000 + 2500 + 500 + gone.priceCents, discountCents: 300, taxCents: 0, totalCents: 2000 + 2500 + 500 + gone.priceCents - 300 });
    expect(view.needsConfirm.map((p) => p.id)).toEqual([reserved.id]);
    expect(view.blocked.map((b) => b.piece.id)).toEqual([gone.id]);
    expect(view.etsy.map((p) => p.id)).toEqual([etsy.id]);
  });
  it("refuses a discount bigger than the total", () => {
    const p = piece({ priceCents: 1000 });
    expect(viewCart([{ productId: p.id, quantity: 1 }], new Map([[p.id, p]]), 1500).totals).toMatchObject({ ok: false });
  });
});
