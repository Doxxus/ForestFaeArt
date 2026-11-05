import { describe, expect, it } from "vitest";
import { effectiveEventId, PosStore, type CheckoutForm, type Persistence, type PosApi, type SessionUser, type StoreDeps } from "./store";
import type { QueuedSale } from "../lib/queue";
import type { Catalog, Piece, SaleRequest, SaleResult } from "../types";

const httpError = (status: number, message = "no") => Object.assign(new Error(message), { data: { httpStatus: status } });
const user: SessionUser = { id: "U1", name: "Sam", role: "STAFF" };

let n = 0;
const piece = (over: Partial<Piece> = {}): Piece => {
  n += 1;
  return { id: `P${n}`, sku: `FFA-${String(n).padStart(6, "0")}`, title: `Piece ${n}`, priceCents: 4500, status: "AVAILABLE", quantity: 1, listedOnEtsy: false, thumbnailKey: null, reservedFor: null, reservedNote: null, eventIds: [], ...over };
};

/** A stand-in for the server that remembers keys and stock, as the real one does. */
class FakeServer {
  pieces: Piece[];
  sales = new Map<string, SaleResult>();
  online = true;
  loseNextReply = false;
  recordFailsWith: number | null = null;
  sessionOk = true;
  calls: string[] = [];
  serverTime = 1_000_000;
  activeEventId: string | null = null;
  constructor(pieces: Piece[]) {
    this.pieces = pieces;
  }
  catalog(): Catalog {
    return { serverTime: this.serverTime, businessName: "Forest Fae Folk Art", paymentMethods: ["CASH", "CARD"], taxRegistered: false, events: [], activeEventId: this.activeEventId, pieces: this.pieces.map((p) => ({ ...p })) };
  }
  api(): PosApi {
    const gate = () => {
      if (!this.online) throw new TypeError("Network request failed");
      if (!this.sessionOk) throw httpError(401, "Please sign in again.");
    };
    return {
      auth: { login: { mutate: async () => ({ token: "tok", user }) } },
      pos: {
        catalog: {
          query: async () => {
            gate();
            return this.catalog();
          },
        },
      },
      sales: {
        record: {
          mutate: async (req: SaleRequest) => {
            gate();
            this.calls.push(req.idempotencyKey);
            if (this.recordFailsWith) throw httpError(this.recordFailsWith, "busy");
            const again = this.sales.get(req.idempotencyKey);
            if (again) return { ...again, duplicate: true };
            for (const item of req.items) {
              const p = this.pieces.find((x) => x.id === item.productId)!;
              if (p.status === "SOLD" || p.quantity < (item.quantity ?? 1)) throw httpError(409, `${p.title} (${p.sku}) is already sold.`);
            }
            for (const item of req.items) {
              const p = this.pieces.find((x) => x.id === item.productId)!;
              p.quantity -= item.quantity ?? 1;
              if (p.quantity === 0) p.status = "SOLD";
            }
            const result = { duplicate: false, sale: { id: `S${this.sales.size + 1}`, number: this.sales.size + 1, totalCents: 0 }, etsy: [], receipt: "NONE" } as unknown as SaleResult;
            this.sales.set(req.idempotencyKey, result);
            if (this.loseNextReply) {
              this.loseNextReply = false;
              throw new TypeError("Network request failed");
            }
            return result;
          },
        },
        void: { mutate: async () => ({ ok: true as const }) },
        today: { query: async () => ({ summary: {} as never, sales: [] }) },
        sendReceipt: { mutate: async () => ({ outcome: "SENT" }) },
      },
      customers: { search: { query: async () => [] } },
    };
  }
}

class FakeStorage implements Persistence {
  tokenValue: string | null = null;
  userValue: SessionUser | null = null;
  catalog: Catalog | null = null;
  queue: QueuedSale[] = [];
  event: string | null | undefined = undefined;
  log: string[] = [];
  token = {
    get: async () => this.tokenValue,
    set: async (t: string) => {
      this.tokenValue = t;
    },
    clear: async () => {
      this.tokenValue = null;
    },
  };
  async loadUser() {
    return this.userValue;
  }
  async saveUser(u: SessionUser) {
    this.userValue = u;
  }
  async loadCatalog() {
    return this.catalog;
  }
  async saveCatalog(c: Catalog) {
    this.catalog = c;
  }
  async loadQueue() {
    return this.queue;
  }
  async saveQueue(q: QueuedSale[]) {
    this.log.push(`queue:${q.length}`);
    this.queue = JSON.parse(JSON.stringify(q));
  }
  async loadEvent() {
    return this.event;
  }
  async saveEvent(v: string | null | undefined) {
    this.event = v;
  }
  async clearSession() {
    this.userValue = null;
    this.event = undefined;
  }
}

let keyN = 0;
function setup(pieces: Piece[] = [piece()], extra: Partial<StoreDeps> = {}) {
  const server = new FakeServer(pieces);
  const storage = new FakeStorage();
  const original = server.api();
  const api = { ...original, sales: { ...original.sales, record: { mutate: (r: SaleRequest) => { storage.log.push("send"); return original.sales.record.mutate(r); } } } } as PosApi;
  let clock = 1_000_000;
  const store = new PosStore({ api: () => api, storage, now: () => clock, newKey: () => `key-${String(++keyN).padStart(8, "0")}`, ...extra });
  return { server, storage, store, advance: (ms: number) => (clock += ms), setClock: (t: number) => (clock = t) };
}
const form = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({ method: "CASH", channel: "MARKET", discountCents: 0, discountReason: "", notes: "", customer: { kind: "none" }, receiptEmail: "", ...over });
const settle = () => new Promise((r) => setTimeout(r, 0));

async function signedIn(pieces?: Piece[]) {
  const s = setup(pieces);
  await s.store.start();
  await s.store.signIn("sam@example.com", "pw");
  await settle();
  await settle();
  return s;
}

describe("starting and signing in", () => {
  it("opens signed out, then loads the catalog after sign-in and remembers it", async () => {
    const s = setup();
    await s.store.start();
    expect(s.store.getState().phase).toBe("signed-out");
    expect(await s.store.signIn("sam@example.com", "pw")).toEqual({ ok: true });
    await settle();
    await settle();
    expect(s.store.getState()).toMatchObject({ phase: "ready", user });
    expect(s.store.getState().catalog?.pieces).toHaveLength(1);
    expect(s.storage.catalog?.pieces).toHaveLength(1);
    expect(s.storage.tokenValue).toBe("tok");
  });
  it("opens straight to the app, offline, from what the phone remembers", async () => {
    const first = await signedIn();
    const second = setup();
    second.storage.tokenValue = first.storage.tokenValue;
    second.storage.userValue = user;
    second.storage.catalog = first.storage.catalog;
    second.server.online = false;
    await second.store.start();
    expect(second.store.getState()).toMatchObject({ phase: "ready" });
    expect(second.store.getState().catalog?.pieces).toHaveLength(1);
    await settle();
    expect(second.store.getState().online).toBe(false);
  });
  it("explains a failed sign-in with no connection", async () => {
    const s = setup();
    s.store.getState();
    const result = await new PosStore({ api: () => ({ ...s.server.api(), auth: { login: { mutate: async () => { throw new TypeError("Network request failed"); } } } }), storage: s.storage, now: () => 0, newKey: () => "k" }).signIn("a@b.co", "x");
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toMatch(/No connection/);
  });
});

describe("selling online (POS-2)", () => {
  it("records the sale, empties the cart and leaves nothing waiting", async () => {
    const p = piece({ priceCents: 4500 });
    const s = await signedIn([p]);
    expect(s.store.addPiece(s.store.getState().catalog!.pieces[0]!)).toMatchObject({ ok: true });
    const out = await s.store.checkout(form());
    expect(out.kind).toBe("recorded");
    expect(s.store.getState().cart).toEqual([]);
    expect(s.store.getState().queue).toEqual([]);
    expect(s.server.pieces[0]).toMatchObject({ status: "SOLD" });
  });
  it("writes the sale to the phone before sending it", async () => {
    const s = await signedIn();
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    s.storage.log.length = 0;
    await s.store.checkout(form());
    expect(s.storage.log.indexOf("queue:1")).toBeGreaterThanOrEqual(0);
    expect(s.storage.log.indexOf("queue:1")).toBeLessThan(s.storage.log.indexOf("send"));
  });
  it("sends what the person entered, with the event, discount and customer", async () => {
    const s = await signedIn([piece({ priceCents: 4500, eventIds: ["E1"] })]);
    s.server.activeEventId = "E1";
    await s.store.refreshCatalog();
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    let seen: SaleRequest | undefined;
    const api = s.server.api();
    const spy = new PosStore({ api: () => ({ ...api, sales: { ...api.sales, record: { mutate: async (r: SaleRequest) => { seen = r; return api.sales.record.mutate(r); } } } }), storage: s.storage, now: () => 1_000_000, newKey: () => "key-spy-000001" });
    await spy.start();
    await spy.refreshCatalog();
    spy.addPiece(spy.getState().catalog!.pieces[0]!);
    await spy.checkout(form({ discountCents: 500, discountReason: "Friend", notes: "Hi", customer: { kind: "existing", id: "C1", name: "Jo" }, receiptEmail: " jo@example.com ", method: "CARD", channel: "ETSY" }));
    expect(seen).toMatchObject({ idempotencyKey: "key-spy-000001", channel: "ETSY", eventId: "E1", paymentMethod: "CARD", discountCents: 500, discountReason: "Friend", notes: "Hi", customerId: "C1", receiptEmail: "jo@example.com", items: [{ quantity: 1 }] });
  });
  it("won't record an empty cart, a bad discount or a blocked piece", async () => {
    const s = await signedIn([piece({ priceCents: 1000 })]);
    expect((await s.store.checkout(form())).kind).toBe("invalid");
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    expect(await s.store.checkout(form({ discountCents: 2000, discountReason: "x" }))).toMatchObject({ kind: "invalid", message: expect.stringMatching(/more than the total/) });
    expect(await s.store.checkout(form({ discountCents: 100 }))).toMatchObject({ kind: "invalid", message: expect.stringMatching(/why/) });
    expect(s.server.calls).toEqual([]);
  });
});

describe("selling with no signal (POS-10)", () => {
  it("keeps the sale, takes the piece off the phone's stock, and sends it when the signal returns", async () => {
    const s = await signedIn();
    const catalogPiece = s.store.getState().catalog!.pieces[0]!;
    s.server.online = false;
    s.store.addPiece(catalogPiece);
    const out = await s.store.checkout(form());
    expect(out).toMatchObject({ kind: "queued", reason: "offline" });
    const state = s.store.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.cart).toEqual([]);
    expect(state.online).toBe(false);
    expect(state.catalog!.pieces[0]).toMatchObject({ status: "SOLD", quantity: 0 });
    // The same piece can't be sold again from this phone while the first sale waits.
    expect(s.store.addPiece(state.catalog!.pieces[0]!)).toMatchObject({ ok: false });
    expect(s.storage.queue).toHaveLength(1);

    s.server.online = true;
    await s.store.tick({ catalog: true });
    expect(s.store.getState().queue).toEqual([]);
    expect(s.storage.queue).toEqual([]);
    expect(s.server.sales.size).toBe(1);
    expect(s.store.getState().online).toBe(true);
  });
  it("survives the app being closed with sales waiting", async () => {
    const s = await signedIn();
    s.server.online = false;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    await s.store.checkout(form());
    const reopened = new PosStore({ api: () => s.server.api(), storage: s.storage, now: () => 1_000_500, newKey: () => "k" });
    await reopened.start();
    expect(reopened.getState().queue).toHaveLength(1);
    s.server.online = true;
    await reopened.tick({ catalog: false });
    expect(reopened.getState().queue).toEqual([]);
    expect(s.server.sales.size).toBe(1);
  });
  it("sends sales made offline in the order they were made", async () => {
    const s = await signedIn([piece(), piece(), piece()]);
    s.server.online = false;
    const ids = s.store.getState().catalog!.pieces.map((p) => p.id);
    for (const id of ids) {
      s.store.addPiece(s.store.getState().catalog!.pieces.find((p) => p.id === id)!);
      await s.store.checkout(form());
    }
    const keys = s.store.getState().queue.map((q) => q.key);
    s.server.online = true;
    await s.store.tick({ catalog: false });
    expect(s.server.calls).toEqual(keys);
  });
  it("never records a sale twice when the reply is lost", async () => {
    const s = await signedIn();
    s.server.loseNextReply = true;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    const out = await s.store.checkout(form());
    expect(out.kind).toBe("queued");
    expect(s.server.sales.size).toBe(1);
    await s.store.tick({ catalog: false });
    expect(s.store.getState().queue).toEqual([]);
    expect(s.server.sales.size).toBe(1);
    expect(new Set(s.server.calls).size).toBe(1);
  });
  it("keeps waiting sales on top of a fresh catalog that doesn't know about them", async () => {
    const s = await signedIn([piece({ quantity: 3 })]);
    s.server.online = false;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!, 2);
    await s.store.checkout(form());
    // The server is reachable again but can't take sales yet, so its stock still says 3.
    s.server.online = true;
    s.server.recordFailsWith = 503;
    expect(await s.store.refreshCatalog()).toBe(true);
    expect(s.server.pieces[0]!.quantity).toBe(3);
    expect(s.store.getState().catalog!.pieces[0]).toMatchObject({ quantity: 1 });
    expect(s.storage.catalog!.pieces[0]).toMatchObject({ quantity: 1 });
  });
});

describe("a sale the server refuses", () => {
  it("is not kept, and the cart stays so it can be fixed", async () => {
    const s = await signedIn();
    const p = s.store.getState().catalog!.pieces[0]!;
    s.server.pieces[0]!.status = "SOLD";
    s.server.pieces[0]!.quantity = 0;
    s.store.addPiece(p);
    const out = await s.store.checkout(form());
    expect(out).toMatchObject({ kind: "rejected", message: expect.stringMatching(/already sold/) });
    expect(s.store.getState().queue).toEqual([]);
    expect(s.store.getState().cart).toHaveLength(1);
    // The catalog is refreshed, so the piece now shows as sold.
    expect(s.store.getState().catalog!.pieces[0]).toMatchObject({ status: "SOLD" });
  });
  it("parks an offline sale for review when it is refused later, and lets it be discarded or retried", async () => {
    const s = await signedIn();
    s.server.online = false;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    await s.store.checkout(form());
    s.server.pieces[0]!.status = "SOLD";
    s.server.pieces[0]!.quantity = 0;
    s.server.online = true;
    await s.store.tick({ catalog: false });
    const parked = s.store.getState().queue;
    expect(parked).toHaveLength(1);
    expect(parked[0]).toMatchObject({ status: "NEEDS_REVIEW", error: expect.stringMatching(/already sold/) });
    expect(s.storage.queue[0]?.status).toBe("NEEDS_REVIEW");
    await s.store.discardSale(parked[0]!.key);
    expect(s.store.getState().queue).toEqual([]);
  });
});

describe("a session that has ended", () => {
  it("keeps the sale and asks for a sign-in, then sends it after signing in", async () => {
    const s = await signedIn();
    s.server.sessionOk = false;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    const out = await s.store.checkout(form());
    expect(out).toMatchObject({ kind: "queued", reason: "sign-in" });
    expect(s.store.getState()).toMatchObject({ phase: "signed-out", needsSignIn: true });
    expect(s.store.getState().queue).toHaveLength(1);
    s.server.sessionOk = true;
    await s.store.signIn("sam@example.com", "pw");
    await settle();
    await settle();
    expect(s.store.getState().queue).toEqual([]);
    expect(s.server.sales.size).toBe(1);
    expect(s.store.getState().needsSignIn).toBe(false);
  });
  it("signing out keeps waiting sales", async () => {
    const s = await signedIn();
    s.server.online = false;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    await s.store.checkout(form());
    await s.store.signOut();
    expect(s.store.getState()).toMatchObject({ phase: "signed-out", user: null, cart: [] });
    expect(s.storage.queue).toHaveLength(1);
    expect(s.storage.tokenValue).toBeNull();
  });
});

describe("events (POS-7)", () => {
  it("follows the calendar unless one is chosen, and remembers the choice", async () => {
    const s = await signedIn();
    s.server.activeEventId = "E1";
    await s.store.refreshCatalog();
    expect(effectiveEventId(s.store.getState())).toBe("E1");
    await s.store.setEvent(null);
    expect(effectiveEventId(s.store.getState())).toBeNull();
    expect(s.storage.event).toBeNull();
    await s.store.setEvent("E2");
    expect(effectiveEventId(s.store.getState())).toBe("E2");
    await s.store.setEvent(undefined);
    expect(effectiveEventId(s.store.getState())).toBe("E1");
  });
});

describe("the phone's clock", () => {
  it("stamps sales with the server's time when the phone's clock is wrong", async () => {
    const s = setup([piece()]);
    s.server.serverTime = 5_000_000;
    await s.store.start();
    await s.store.signIn("a@b.co", "x");
    await settle();
    await settle();
    let seen: number | undefined;
    const api = s.server.api();
    const store = new PosStore({ api: () => ({ ...api, sales: { ...api.sales, record: { mutate: async (r: SaleRequest) => { seen = r.occurredAt; return api.sales.record.mutate(r); } } } }), storage: s.storage, now: () => 1_000_000, newKey: () => "key-clock-0001" });
    await store.start();
    await store.refreshCatalog();
    store.addPiece(store.getState().catalog!.pieces[0]!);
    await store.checkout(form());
    expect(seen).toBeGreaterThan(4_900_000);
    expect(seen).toBeLessThan(5_100_000);
  });
  it("always sends a whole number of milliseconds, even when the clock difference is a half", async () => {
    let tick = 0;
    const seen: number[] = [];
    const s = setup([piece()]);
    const api = s.server.api();
    s.server.serverTime = 2_000_000;
    const store = new PosStore({
      api: () => ({ ...api, sales: { ...api.sales, record: { mutate: async (r: SaleRequest) => { seen.push(r.occurredAt!); return api.sales.record.mutate(r); } } } }),
      storage: s.storage,
      now: () => 1_000_000 + 1 * (tick++ % 2),
      newKey: () => "key-round-0001",
    });
    await store.start();
    await store.signIn("a@b.co", "x");
    await settle();
    await settle();
    store.addPiece(store.getState().catalog!.pieces[0]!);
    await store.checkout(form());
    expect(seen.length).toBeGreaterThan(0);
    for (const t of seen) expect(Number.isInteger(t)).toBe(true);
  });
  it("rounds the time on a sale that was saved with a fractional one", async () => {
    const s = await signedIn();
    s.server.online = false;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    await s.store.checkout(form());
    const queue = s.store.getState().queue.map((q) => ({ ...q, request: { ...q.request, occurredAt: 1_000_000.5 } }));
    s.storage.queue = queue;
    const again = setup();
    again.server.pieces = s.server.pieces;
    again.storage.queue = queue;
    again.storage.tokenValue = "tok";
    again.storage.userValue = user;
    again.storage.catalog = s.storage.catalog;
    let seen: number | undefined;
    const api = again.server.api();
    const store = new PosStore({ api: () => ({ ...api, sales: { ...api.sales, record: { mutate: async (r: SaleRequest) => { seen = r.occurredAt; return api.sales.record.mutate(r); } } } }), storage: again.storage, now: () => 1_000_000, newKey: () => "k" });
    await store.start();
    await settle();
    await settle();
    expect(seen).toBe(1_000_001);
  });
});

describe("a bad connection at the till", () => {
  it("saves the sale straight away, without calling the server, when the phone knows it has no connection", async () => {
    const s = setup([piece()], { isOnline: async () => false });
    await s.store.start();
    await s.store.signIn("a@b.co", "x");
    await settle();
    await settle();
    s.server.calls.length = 0;
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    const out = await s.store.checkout(form());
    expect(out).toMatchObject({ kind: "queued", reason: "offline" });
    expect(s.server.calls).toEqual([]);
    expect(s.store.getState()).toMatchObject({ cart: [], online: false });
    expect(s.store.getState().queue).toHaveLength(1);
  });
  it("stops waiting on a server that never answers and keeps the sale", async () => {
    const s = setup([piece()], { checkoutWaitMs: 20 });
    await s.store.start();
    await s.store.signIn("a@b.co", "x");
    await settle();
    await settle();
    const stuck = new PosStore({
      api: () => ({ ...s.server.api(), sales: { ...s.server.api().sales, record: { mutate: () => new Promise<SaleResult>(() => undefined) } } }),
      storage: s.storage,
      now: () => 1_000_000,
      newKey: () => "key-stuck-0001",
      checkoutWaitMs: 20,
    });
    await stuck.start();
    await stuck.refreshCatalog();
    stuck.addPiece(stuck.getState().catalog!.pieces[0]!);
    const out = await stuck.checkout(form());
    expect(out.kind).toBe("queued");
    expect(stuck.getState().cart).toEqual([]);
    expect(stuck.getState().queue).toHaveLength(1);
  });
});

describe("undoing a sale", () => {
  it("puts the piece back on the phone's stock at once, even before the download finishes", async () => {
    const s = await signedIn();
    s.store.addPiece(s.store.getState().catalog!.pieces[0]!);
    const out = await s.store.checkout(form());
    expect(out.kind).toBe("recorded");
    await settle();
    expect(s.store.getState().catalog!.pieces[0]).toMatchObject({ status: "SOLD" });
    s.server.online = false;
    await s.store.restoreSale([{ productId: s.store.getState().catalog!.pieces[0]!.id, quantity: 1 }]);
    expect(s.store.getState().catalog!.pieces[0]).toMatchObject({ status: "AVAILABLE", quantity: 1 });
  });
});

