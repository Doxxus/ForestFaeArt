import { looseSku } from "./scan";
import type { Catalog, Piece } from "../types";

export type Sellability =
  | { level: "ok" }
  /** Allowed, but only after the person confirms (a reserved piece, POS-3). */
  | { level: "confirm"; message: string }
  | { level: "blocked"; message: string };

/** Whether a piece can be sold right now, and the plain-words reason when it can't (POS-3). */
export function sellability(piece: Piece, wanted = 1): Sellability {
  switch (piece.status) {
    case "SOLD":
      return { level: "blocked", message: "This piece is already sold." };
    case "DRAFT":
      return { level: "blocked", message: "This piece is still a draft, so it isn't ready to sell." };
    case "ARCHIVED":
      return { level: "blocked", message: "This piece is archived." };
    case "PENDING_PAYMENT":
      return { level: "blocked", message: "This piece is waiting for a payment from someone." };
    default:
      break;
  }
  if (piece.quantity <= 0) return { level: "blocked", message: "None left in stock." };
  if (wanted > piece.quantity) return { level: "blocked", message: `Only ${piece.quantity} left.` };
  if (piece.status === "RESERVED") {
    return { level: "confirm", message: piece.reservedFor ? `Reserved for ${piece.reservedFor}.${piece.reservedNote ? ` ${piece.reservedNote}` : ""}` : "This piece is reserved for someone." };
  }
  return { level: "ok" };
}

export const findBySku = (catalog: Catalog | null, sku: string): Piece | null => catalog?.pieces.find((p) => p.sku === sku.toUpperCase()) ?? null;

export function indexById(catalog: Catalog | null): Map<string, Piece> {
  return new Map((catalog?.pieces ?? []).map((p) => [p.id, p]));
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Pieces matching what was typed: a SKU (in a loose form) or words from the title (POS-8). Sellable pieces come first,
 * then by SKU, so the thing someone is looking for to sell is at the top.
 */
export function searchPieces(catalog: Catalog | null, query: string, opts: { eventId?: string | null; limit?: number } = {}): Piece[] {
  if (!catalog) return [];
  const q = norm(query);
  const sku = looseSku(query);
  const words = q.split(" ").filter(Boolean);
  const rank = (p: Piece) => (p.status === "SOLD" || p.status === "ARCHIVED" || p.status === "DRAFT" ? 1 : 0);
  const hits = catalog.pieces.filter((p) => {
    if (sku) return p.sku === sku;
    if (!words.length) return opts.eventId ? p.eventIds.includes(opts.eventId) : false;
    const title = norm(p.title);
    return words.every((w) => title.includes(w) || p.sku.toLowerCase().includes(w));
  });
  return hits.sort((a, b) => rank(a) - rank(b) || a.sku.localeCompare(b.sku)).slice(0, opts.limit ?? 40);
}

/** The pieces taken to an event, for browsing without typing. Sellable first. */
export function piecesAtEvent(catalog: Catalog | null, eventId: string | null): Piece[] {
  if (!catalog || !eventId) return [];
  return catalog.pieces.filter((p) => p.eventIds.includes(eventId) && p.status !== "SOLD").sort((a, b) => a.title.localeCompare(b.title));
}

/** A sale made on this phone, taken off the stock it was sold from so the same piece can't be sold twice while offline. */
export function applySale(catalog: Catalog, lines: { productId: string; quantity: number }[]): Catalog {
  const bought = new Map(lines.map((l) => [l.productId, l.quantity]));
  return {
    ...catalog,
    pieces: catalog.pieces.map((p) => {
      const n = bought.get(p.id);
      if (!n) return p;
      const quantity = Math.max(0, p.quantity - n);
      return { ...p, quantity, status: quantity === 0 ? "SOLD" : p.status };
    }),
  };
}

/** The same thing for several waiting sales, used after a fresh catalog arrives that doesn't know about them yet. */
export function applySales(catalog: Catalog, sales: { items: { productId: string; quantity: number }[] }[]): Catalog {
  return sales.reduce((c, s) => applySale(c, s.items), catalog);
}
