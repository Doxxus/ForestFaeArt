import { saleTotals, SALE_LIMITS, type SaleTotals } from "@ffa/validators";
import { sellability } from "./catalog";
import type { Piece } from "../types";

export interface CartLine {
  productId: string;
  quantity: number;
}

export type CartResult = { ok: true; cart: CartLine[] } | { ok: false; message: string };

/** Adds a piece to the cart (POS-9). Stops at the stock left, and says why when it can't be added (POS-15). */
export function addToCart(cart: CartLine[], piece: Piece, quantity = 1): CartResult {
  const existing = cart.find((l) => l.productId === piece.id);
  const wanted = (existing?.quantity ?? 0) + quantity;
  const check = sellability(piece, wanted);
  if (check.level === "blocked") return { ok: false, message: existing ? `You already have ${existing.quantity} of this in the cart. ${check.message}` : check.message };
  if (cart.length >= SALE_LIMITS.maxLines && !existing) return { ok: false, message: "That's a lot of different pieces for one sale. Please record this sale first." };
  if (existing) return { ok: true, cart: cart.map((l) => (l.productId === piece.id ? { ...l, quantity: wanted } : l)) };
  return { ok: true, cart: [...cart, { productId: piece.id, quantity }] };
}

/** Sets a line to an exact quantity, or removes it at zero. Never above the stock. */
export function setQuantity(cart: CartLine[], piece: Piece, quantity: number): CartResult {
  if (quantity <= 0) return { ok: true, cart: cart.filter((l) => l.productId !== piece.id) };
  const check = sellability(piece, quantity);
  if (check.level === "blocked") return { ok: false, message: check.message };
  return { ok: true, cart: cart.map((l) => (l.productId === piece.id ? { ...l, quantity } : l)) };
}

export const removeFromCart = (cart: CartLine[], productId: string): CartLine[] => cart.filter((l) => l.productId !== productId);

export interface CartView {
  lines: { piece: Piece; quantity: number; lineCents: number }[];
  totals: SaleTotals;
  /** Pieces in the cart that need a yes before selling (reserved). */
  needsConfirm: Piece[];
  /** Pieces that can no longer be sold, for example after the catalog refreshed. */
  blocked: { piece: Piece; message: string }[];
  etsy: Piece[];
}

/** Prices and checks a cart against the current catalog. Lines for pieces that are gone from the catalog are dropped. */
export function viewCart(cart: CartLine[], byId: Map<string, Piece>, discountCents = 0): CartView {
  const lines = cart.flatMap((l) => {
    const piece = byId.get(l.productId);
    return piece ? [{ piece, quantity: l.quantity, lineCents: piece.priceCents * l.quantity }] : [];
  });
  const needsConfirm: Piece[] = [];
  const blocked: CartView["blocked"] = [];
  for (const l of lines) {
    const s = sellability(l.piece, l.quantity);
    if (s.level === "confirm") needsConfirm.push(l.piece);
    if (s.level === "blocked") blocked.push({ piece: l.piece, message: s.message });
  }
  return {
    lines,
    totals: saleTotals(lines.map((l) => ({ priceCents: l.piece.priceCents, quantity: l.quantity })), discountCents),
    needsConfirm,
    blocked,
    etsy: lines.filter((l) => l.piece.listedOnEtsy).map((l) => l.piece),
  };
}
