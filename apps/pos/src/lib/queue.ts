import type { SaleRequest, SaleResult } from "../types";

/**
 * The offline queue (POS-10). A sale is written to the phone first, then sent. It stays in the queue until the server
 * confirms it, so a dropped signal, a closed app or a flat battery can't lose a sale. Every sale carries its own
 * idempotency key, so sending it again after an unclear failure can never record it twice.
 */

export type QueueStatus = "PENDING" | "NEEDS_REVIEW";

export interface QueuedSale {
  /** The idempotency key. */
  key: string;
  request: SaleRequest;
  createdAt: number;
  status: QueueStatus;
  attempts: number;
  /** Why it needs a person to look at it. */
  error?: string;
  /** Enough to show the sale in a list without looking anything up. */
  summary: { totalCents: number; itemCount: number; titles: string[] };
}

export function enqueue(queue: readonly QueuedSale[], sale: Omit<QueuedSale, "status" | "attempts">): QueuedSale[] {
  if (queue.some((q) => q.key === sale.key)) return [...queue];
  return [...queue, { ...sale, status: "PENDING", attempts: 0 }];
}

export const pendingSales = (queue: readonly QueuedSale[]) => queue.filter((q) => q.status === "PENDING");
export const reviewSales = (queue: readonly QueuedSale[]) => queue.filter((q) => q.status === "NEEDS_REVIEW");

export const discard = (queue: readonly QueuedSale[], key: string): QueuedSale[] => queue.filter((q) => q.key !== key);

/** Puts a sale that needed review back in line to be sent again, for example after fixing the stock. */
export const retry = (queue: readonly QueuedSale[], key: string): QueuedSale[] =>
  queue.map((q) => (q.key === key ? { ...q, status: "PENDING", error: undefined } : q));

export type Failure =
  /** No signal, or the server didn't answer in time. Try again later. */
  | { kind: "offline" }
  /** The server had a problem. Try again later. */
  | { kind: "server"; message: string }
  /** The session ended. Sales wait until someone signs in again. */
  | { kind: "sign-in" }
  /** The server understood and said no (for example the piece was already sold). A person has to decide. */
  | { kind: "rejected"; message: string };

interface ErrorLike {
  message?: string;
  data?: { httpStatus?: number } | null;
}

/** Sorts an error from the API client into what to do about it. */
export function classifyError(error: unknown): Failure {
  const e = (error ?? {}) as ErrorLike;
  const status = e.data?.httpStatus;
  if (typeof status !== "number") return { kind: "offline" };
  if (status === 401) return { kind: "sign-in" };
  if (status === 408 || status === 429 || status >= 500) return { kind: "server", message: "The server is busy." };
  if (status === 400 && e.message?.trim().startsWith("[")) return { kind: "rejected", message: "The server couldn't accept this sale. Please try again, and tell the developer if it keeps happening." };
  return { kind: "rejected", message: e.message?.trim() || "The server couldn't record this sale." };
}

export type Send = (request: SaleRequest) => Promise<SaleResult>;

export interface SyncOutcome {
  queue: QueuedSale[];
  /** Sales the server confirmed in this run. */
  sent: { key: string; result: SaleResult }[];
  /** Why it stopped early, if it did. */
  stopped: null | "offline" | "server" | "sign-in";
}

/**
 * Sends waiting sales one at a time, oldest first, and stops at the first failure that would affect every sale after it
 * (no signal, a server problem, a signed-out session). A sale the server refuses is parked for review and the rest carry on.
 */
export async function syncQueue(queue: readonly QueuedSale[], send: Send): Promise<SyncOutcome> {
  let current = [...queue];
  const sent: SyncOutcome["sent"] = [];
  for (const item of queue) {
    if (item.status !== "PENDING") continue;
    try {
      const result = await send(item.request);
      sent.push({ key: item.key, result });
      current = discard(current, item.key);
    } catch (error) {
      const failure = classifyError(error);
      if (failure.kind === "rejected") {
        current = current.map((q) => (q.key === item.key ? { ...q, status: "NEEDS_REVIEW", attempts: q.attempts + 1, error: failure.message } : q));
        continue;
      }
      current = current.map((q) => (q.key === item.key ? { ...q, attempts: q.attempts + 1 } : q));
      return { queue: current, sent, stopped: failure.kind };
    }
  }
  return { queue: current, sent, stopped: null };
}

/** A fresh idempotency key. Random, and long enough that two phones never collide. */
export function newSaleKey(random: () => number = Math.random, now: () => number = Date.now): string {
  const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `pos-${now().toString(36)}-${part()}${part()}${part()}`;
}
