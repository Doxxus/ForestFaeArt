import { and, asc, customers, eventProducts, events, gte, isNull, lte, ne, products, sql } from "@ffa/db";
import type { PaymentMethod, ProductStatus } from "@ffa/validators";
import { customerDisplayName } from "./customers";
import { loadSettings } from "./settings";
import type { Db } from "../store";

/** Everything the POS app keeps on the phone so it can sell with no signal (POS-10). Never includes cost. */
export interface PosPiece {
  id: string;
  sku: string;
  title: string;
  priceCents: number;
  status: ProductStatus;
  quantity: number;
  listedOnEtsy: boolean;
  thumbnailKey: string | null;
  reservedFor: string | null;
  reservedNote: string | null;
  /** Events this piece is out at right now. */
  eventIds: string[];
}

export interface PosEvent {
  id: string;
  title: string;
  venue: string;
  startsAt: number;
  endsAt: number;
  timezone: string;
}

export interface PosCatalog {
  serverTime: number;
  businessName: string;
  paymentMethods: PaymentMethod[];
  taxRegistered: boolean;
  events: PosEvent[];
  /** The event happening around now, if any, so the sale can default to a market sale (POS-7). */
  activeEventId: string | null;
  pieces: PosPiece[];
}

const DAY = 24 * 3600_000;
/** A market's selling window runs a little either side of its listed hours. */
const SLACK = 12 * 3600_000;

export async function loadPosCatalog(db: Db, now: number): Promise<PosCatalog> {
  const [settings, rows, links, eventRows] = await Promise.all([
    loadSettings(db),
    db
      .select({
        id: products.id,
        sku: products.sku,
        title: products.title,
        priceCents: products.priceCents,
        status: products.status,
        quantity: products.quantity,
        listedOnEtsy: products.listedOnEtsy,
        reservedCustomerId: products.reservedCustomerId,
        reservedNote: products.reservedNote,
        firstName: customers.firstName,
        lastName: customers.lastName,
        thumbnailKey: sql<string | null>`(SELECT pi.r2_key FROM product_image pi WHERE pi.product_id = product.id AND pi.is_primary = 1)`,
      })
      .from(products)
      .leftJoin(customers, sql`${customers.id} = ${products.reservedCustomerId}`)
      .orderBy(asc(products.sku))
      .limit(3000)
      .all(),
    db.select({ productId: eventProducts.productId, eventId: eventProducts.eventId }).from(eventProducts).where(isNull(eventProducts.releasedAt)).all(),
    db
      .select({ id: events.id, title: events.title, venue: events.venue, startsAt: events.startsAt, endsAt: events.endsAt, timezone: events.timezone })
      .from(events)
      .where(and(isNull(events.archivedAt), ne(events.status, "CANCELLED"), gte(events.endsAt, new Date(now - 2 * DAY)), lte(events.startsAt, new Date(now + 14 * DAY))))
      .orderBy(asc(events.startsAt))
      .all(),
  ]);
  const eventIdsByProduct = new Map<string, string[]>();
  for (const l of links) eventIdsByProduct.set(l.productId, [...(eventIdsByProduct.get(l.productId) ?? []), l.eventId]);

  const posEvents: PosEvent[] = eventRows.map((e) => ({ id: e.id, title: e.title, venue: e.venue, startsAt: e.startsAt.getTime(), endsAt: e.endsAt.getTime(), timezone: e.timezone }));
  const active = posEvents.find((e) => now >= e.startsAt - SLACK && now <= e.endsAt + SLACK) ?? null;

  return {
    serverTime: now,
    businessName: settings.businessName,
    paymentMethods: settings.paymentMethods,
    taxRegistered: settings.taxRegistered,
    events: posEvents,
    activeEventId: active?.id ?? null,
    pieces: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      title: r.title,
      priceCents: r.priceCents,
      status: r.status,
      quantity: r.quantity,
      listedOnEtsy: r.listedOnEtsy,
      thumbnailKey: r.thumbnailKey,
      reservedFor: r.reservedCustomerId ? customerDisplayName({ firstName: r.firstName ?? "", lastName: r.lastName ?? "" }) : null,
      reservedNote: r.reservedNote,
      eventIds: eventIdsByProduct.get(r.id) ?? [],
    })),
  };
}
