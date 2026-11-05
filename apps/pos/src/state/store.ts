import type { PaymentMethod, SaleChannel } from "@ffa/validators";
import { applySale, applySales, indexById } from "../lib/catalog";
import { addToCart, removeFromCart, setQuantity, viewCart, type CartLine, type CartResult } from "../lib/cart";
import { classifyError, enqueue, pendingSales, syncQueue, type QueuedSale, type SyncOutcome } from "../lib/queue";
import type { Catalog, CustomerHit, DaySummary, NewCustomer, Piece, SaleRequest, SaleResult, SaleSummary } from "../types";

export interface SessionUser {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF";
}

/** The slice of the API the app uses, so it can be replaced with a fake in tests. */
export interface PosApi {
  auth: { login: { mutate(input: { email: string; password: string; client: "pos" }): Promise<{ token: string; user: SessionUser }> } };
  pos: { catalog: { query(): Promise<Catalog> } };
  sales: {
    record: { mutate(input: SaleRequest): Promise<SaleResult> };
    void: { mutate(input: { saleId: string; reason: string }): Promise<{ ok: true }> };
    today: { query(): Promise<{ summary: DaySummary; sales: SaleSummary[] }> };
    sendReceipt: { mutate(input: { saleId: string; email: string }): Promise<{ outcome: string }> };
  };
  customers: { search: { query(input: { q: string }): Promise<CustomerHit[]> } };
}

export interface Persistence {
  token: { get(): Promise<string | null>; set(token: string): Promise<void>; clear(): Promise<void> };
  loadUser(): Promise<SessionUser | null>;
  saveUser(user: SessionUser): Promise<void>;
  loadCatalog(): Promise<Catalog | null>;
  saveCatalog(catalog: Catalog): Promise<void>;
  loadQueue(): Promise<QueuedSale[]>;
  saveQueue(queue: QueuedSale[]): Promise<void>;
  /** undefined means "choose automatically from the calendar". */
  loadEvent(): Promise<string | null | undefined>;
  saveEvent(value: string | null | undefined): Promise<void>;
  clearSession(): Promise<void>;
}

export interface StoreDeps {
  api(token: string | null): PosApi;
  storage: Persistence;
  now(): number;
  newKey(): string;
}

export type Phase = "loading" | "signed-out" | "ready";

export interface PosState {
  phase: Phase;
  user: SessionUser | null;
  catalog: Catalog | null;
  catalogAt: number | null;
  queue: QueuedSale[];
  /** undefined: follow the calendar. null: no event. A string: that event. */
  eventChoice: string | null | undefined;
  /** Whether the last attempt to reach the server worked. */
  online: boolean;
  syncing: boolean;
  /** Sales are waiting for a sign-in. */
  needsSignIn: boolean;
  cart: CartLine[];
}

export interface CheckoutForm {
  method: PaymentMethod;
  channel: SaleChannel;
  discountCents: number;
  discountReason: string;
  notes: string;
  customer: { kind: "none" } | { kind: "existing"; id: string; name: string } | { kind: "new"; fields: NewCustomer };
  receiptEmail: string;
}

export type CheckoutOutcome =
  | { kind: "recorded"; result: SaleResult }
  /** Saved on this phone. It will be sent when there is a connection. */
  | { kind: "queued"; sale: QueuedSale; reason: "offline" | "server" | "sign-in" }
  | { kind: "rejected"; message: string }
  | { kind: "invalid"; message: string };

const INITIAL: PosState = { phase: "loading", user: null, catalog: null, catalogAt: null, queue: [], eventChoice: undefined, online: true, syncing: false, needsSignIn: false, cart: [] };

/** The event sales are attributed to: the one picked, or the one happening now when nothing was picked (POS-7). */
export const effectiveEventId = (s: Pick<PosState, "eventChoice" | "catalog">): string | null => (s.eventChoice === undefined ? (s.catalog?.activeEventId ?? null) : s.eventChoice);

/** Waiting sales as plain lines, for taking them off the phone's stock. */
const queuedLines = (queue: readonly QueuedSale[]) => pendingSales(queue).map((q) => ({ items: q.request.items.map((i) => ({ productId: i.productId, quantity: i.quantity ?? 1 })) }));

/**
 * Everything the app remembers and does, outside the screens so it can be tested without a phone.
 * Sales are written to the phone before they are sent (POS-10), and the server answers a repeated key with the first sale.
 */
export class PosStore {
  private state: PosState = INITIAL;
  private listeners = new Set<() => void>();
  private token: string | null = null;
  private lock: Promise<unknown> = Promise.resolve();
  private saves: Promise<unknown> = Promise.resolve();
  /** How far the phone's clock is from the server's, so sale times are right even if the phone's clock is off. */
  private skewMs = 0;

  constructor(private readonly deps: StoreDeps) {}

  // ---- store plumbing ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  private set(patch: Partial<PosState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private persist(work: () => Promise<unknown>) {
    this.saves = this.saves.then(work).catch((error) => console.warn("Couldn't save to the phone", error));
    return this.saves;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private api = () => this.deps.api(this.token);

  /** Selected event, or the one happening now when nothing was chosen. */
  get eventId(): string | null {
    return effectiveEventId(this.state);
  }

  private nowOnServer = () => this.deps.now() + this.skewMs;

  // ---- starting up and signing in ----

  async start() {
    const { storage } = this.deps;
    const [token, user, catalog, queue, eventChoice] = await Promise.all([storage.token.get(), storage.loadUser(), storage.loadCatalog(), storage.loadQueue(), storage.loadEvent()]);
    this.token = token;
    this.set({ user, catalog, catalogAt: catalog ? catalog.serverTime : null, queue, eventChoice, phase: token && user ? "ready" : "signed-out" });
    if (this.state.phase === "ready") void this.refreshAndSync();
  }

  async signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const { token, user } = await this.deps.api(null).auth.login.mutate({ email: email.trim(), password, client: "pos" });
      this.token = token;
      await this.deps.storage.token.set(token);
      await this.deps.storage.saveUser(user);
      this.set({ user, phase: "ready", needsSignIn: false, online: true });
      void this.refreshAndSync();
      return { ok: true };
    } catch (error) {
      const f = classifyError(error);
      if (f.kind === "offline") return { ok: false, message: "No connection. Signing in needs the internet, but you only need to do it once a day." };
      return { ok: false, message: f.kind === "rejected" ? f.message : "Something went wrong. Please try again." };
    }
  }

  /** Signs out. Sales still waiting to send stay on the phone and go out after the next sign-in. */
  async signOut() {
    this.token = null;
    await this.deps.storage.token.clear();
    await this.deps.storage.clearSession();
    this.set({ user: null, phase: "signed-out", cart: [], eventChoice: undefined });
  }

  /** The server said the session is over. Keep everything, and ask for a sign-in. */
  private sessionEnded() {
    this.token = null;
    void this.deps.storage.token.clear();
    this.set({ phase: "signed-out", needsSignIn: true });
  }

  // ---- the catalog ----

  async refreshCatalog(): Promise<boolean> {
    if (this.state.phase !== "ready") return false;
    try {
      const before = this.deps.now();
      const fresh = await this.api().pos.catalog.query();
      this.skewMs = fresh.serverTime - (before + this.deps.now()) / 2;
      // Sales still waiting haven't reached the server, so the fresh stock doesn't know about them yet.
      const catalog = applySales(fresh, queuedLines(this.state.queue));
      this.set({ catalog, catalogAt: this.deps.now(), online: true });
      void this.persist(() => this.deps.storage.saveCatalog(catalog));
      return true;
    } catch (error) {
      if (classifyError(error).kind === "sign-in") this.sessionEnded();
      else this.set({ online: false });
      return false;
    }
  }

  async setEvent(choice: string | null | undefined) {
    this.set({ eventChoice: choice });
    await this.persist(() => this.deps.storage.saveEvent(choice));
  }

  // ---- the cart ----

  addPiece(piece: Piece, quantity = 1): CartResult {
    const result = addToCart(this.state.cart, piece, quantity);
    if (result.ok) this.set({ cart: result.cart });
    return result;
  }
  changeQuantity(piece: Piece, quantity: number): CartResult {
    const result = setQuantity(this.state.cart, piece, quantity);
    if (result.ok) this.set({ cart: result.cart });
    return result;
  }
  removePiece(productId: string) {
    this.set({ cart: removeFromCart(this.state.cart, productId) });
  }
  clearCart() {
    this.set({ cart: [] });
  }

  // ---- selling ----

  /**
   * Records the sale on the phone and sends it. If the server accepts it the person sees the real sale. If there's no
   * signal it stays queued and the sale is still done as far as the customer is concerned. If the server refuses it
   * (for example the piece was sold elsewhere) nothing is kept and the cart stays so the person can fix it.
   */
  async checkout(form: CheckoutForm): Promise<CheckoutOutcome> {
    const { catalog, cart } = this.state;
    if (!catalog) return { kind: "invalid", message: "The list of pieces hasn't loaded yet. Please connect once and try again." };
    const view = viewCart(cart, indexById(catalog), form.discountCents);
    if (view.lines.length === 0) return { kind: "invalid", message: "The cart is empty." };
    if (view.blocked.length) return { kind: "invalid", message: `${view.blocked[0]!.piece.title}: ${view.blocked[0]!.message}` };
    if (!view.totals.ok) return { kind: "invalid", message: view.totals.message };
    if (form.discountCents > 0 && !form.discountReason.trim()) return { kind: "invalid", message: "Please say why there is a discount." };

    const eventId = this.eventId;
    const key = this.deps.newKey();
    const email = form.receiptEmail.trim();
    const request: SaleRequest = {
      idempotencyKey: key,
      channel: form.channel,
      eventId: eventId ?? undefined,
      items: view.lines.map((l) => ({ productId: l.piece.id, quantity: l.quantity })),
      paymentMethod: form.method,
      discountCents: form.discountCents,
      discountReason: form.discountReason.trim(),
      notes: form.notes.trim(),
      occurredAt: this.nowOnServer(),
      customerId: form.customer.kind === "existing" ? form.customer.id : undefined,
      newCustomer: form.customer.kind === "new" ? form.customer.fields : undefined,
      receiptEmail: email || undefined,
    };
    const queued: QueuedSale = {
      key,
      request,
      createdAt: this.deps.now(),
      status: "PENDING",
      attempts: 0,
      summary: { totalCents: view.totals.totalCents, itemCount: view.lines.reduce((n, l) => n + l.quantity, 0), titles: view.lines.map((l) => l.piece.title) },
    };

    // Written to the phone first. From here a lost signal, a closed app or a dead battery can't lose the sale.
    const queue = enqueue(this.state.queue, queued);
    this.set({ queue, catalog: applySale(catalog, request.items.map((i) => ({ productId: i.productId, quantity: i.quantity ?? 1 }))) });
    await this.persist(async () => {
      await this.deps.storage.saveQueue(this.state.queue);
      if (this.state.catalog) await this.deps.storage.saveCatalog(this.state.catalog);
    });

    const run = await this.syncNow();
    const sent = run.sent.find((s) => s.key === key);
    if (sent) {
      this.set({ cart: [] });
      return { kind: "recorded", result: sent.result };
    }
    const mine = this.state.queue.find((q) => q.key === key);
    if (mine?.status === "NEEDS_REVIEW") {
      // The server said no, so nothing was recorded. Take it back off the queue and the stock, and keep the cart.
      this.set({ queue: this.state.queue.filter((q) => q.key !== key) });
      await this.persist(() => this.deps.storage.saveQueue(this.state.queue));
      await this.refreshCatalog();
      return { kind: "rejected", message: mine.error ?? "The sale couldn't be recorded." };
    }
    this.set({ cart: [] });
    return { kind: "queued", sale: mine ?? queued, reason: run.stopped ?? "offline" };
  }

  /** Sends every waiting sale. Safe to call at any time, as often as you like. */
  syncNow(): Promise<SyncOutcome> {
    return this.exclusive(async () => {
      const snapshot = this.state.queue;
      if (!this.token || pendingSales(snapshot).length === 0 || this.state.phase === "loading") return { queue: snapshot, sent: [], stopped: null };
      this.set({ syncing: true });
      const api = this.api();
      const out = await syncQueue(snapshot, (request) => api.sales.record.mutate(request));

      // Sales added while this ran aren't in the snapshot. Keep them.
      const known = new Set(snapshot.map((q) => q.key));
      const queue = [...out.queue, ...this.state.queue.filter((q) => !known.has(q.key))];
      this.set({ queue, syncing: false, online: out.stopped !== "offline", needsSignIn: out.stopped === "sign-in" });
      await this.persist(() => this.deps.storage.saveQueue(this.state.queue));
      if (out.stopped === "sign-in") this.sessionEnded();
      if (out.sent.length || queue.some((q) => q.status === "NEEDS_REVIEW")) void this.refreshCatalog();
      return { ...out, queue };
    });
  }

  private async refreshAndSync() {
    await this.syncNow();
    await this.refreshCatalog();
  }

  /** Called when the app opens, the connection comes back, or on a timer. */
  async tick(opts: { catalog: boolean }) {
    if (this.state.phase !== "ready") return;
    await this.syncNow();
    if (opts.catalog) await this.refreshCatalog();
  }

  async retryReview(key: string) {
    this.set({ queue: this.state.queue.map((q) => (q.key === key ? { ...q, status: "PENDING", error: undefined } : q)) });
    await this.persist(() => this.deps.storage.saveQueue(this.state.queue));
    await this.syncNow();
  }

  async discardSale(key: string) {
    this.set({ queue: this.state.queue.filter((q) => q.key !== key) });
    await this.persist(() => this.deps.storage.saveQueue(this.state.queue));
    await this.refreshCatalog();
  }

  /** The API client, for screens that read online-only data (today's sales, customer search, undo). */
  get client(): PosApi {
    return this.api();
  }
}
