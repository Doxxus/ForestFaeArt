import { describe, expect, it } from "vitest";
import { classifyError, discard, enqueue, newSaleKey, pendingSales, retry, reviewSales, syncQueue, type QueuedSale, type Send } from "./queue";
import type { SaleRequest, SaleResult } from "../types";

const request = (key: string): SaleRequest => ({ idempotencyKey: key, channel: "MARKET", items: [{ productId: "P1", quantity: 1 }], paymentMethod: "CASH", discountCents: 0, discountReason: "", notes: "" });
const sale = (key: string, createdAt = 1): Omit<QueuedSale, "status" | "attempts"> => ({ key, request: request(key), createdAt, summary: { totalCents: 4500, itemCount: 1, titles: ["Moth"] } });
const ok = (key: string) => ({ sale: { id: `S-${key}` }, duplicate: false }) as unknown as SaleResult;
const httpError = (status: number, message = "no") => Object.assign(new Error(message), { data: { httpStatus: status } });

describe("classifying failures", () => {
  it("treats a missing response as being offline", () => {
    expect(classifyError(new TypeError("Network request failed"))).toEqual({ kind: "offline" });
    expect(classifyError(new Error("aborted"))).toEqual({ kind: "offline" });
    expect(classifyError(undefined)).toEqual({ kind: "offline" });
  });
  it("sends a signed-out session to sign in", () => {
    expect(classifyError(httpError(401))).toEqual({ kind: "sign-in" });
  });
  it("retries a busy or broken server later", () => {
    for (const s of [408, 429, 500, 502, 503]) expect(classifyError(httpError(s)).kind).toBe("server");
  });
  it("parks a sale the server refuses, with its reason", () => {
    expect(classifyError(httpError(409, "Moth is already sold."))).toEqual({ kind: "rejected", message: "Moth is already sold." });
    expect(classifyError(httpError(400, '[\n  { "path": ["occurredAt"] }\n]'))).toMatchObject({ kind: "rejected", message: expect.not.stringContaining("occurredAt") });
    expect(classifyError(httpError(400, ""))).toMatchObject({ kind: "rejected" });
    expect(classifyError(httpError(404)).kind).toBe("rejected");
    expect(classifyError(httpError(403)).kind).toBe("rejected");
  });
});

describe("the queue", () => {
  it("adds a sale once, however many times it is added", () => {
    let q = enqueue([], sale("a"));
    q = enqueue(q, sale("a"));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ status: "PENDING", attempts: 0 });
  });
  it("splits waiting sales from ones needing review, and discards and retries", () => {
    let q = enqueue(enqueue([], sale("a")), sale("b"));
    q = q.map((s) => (s.key === "b" ? { ...s, status: "NEEDS_REVIEW" as const, error: "x" } : s));
    expect(pendingSales(q).map((s) => s.key)).toEqual(["a"]);
    expect(reviewSales(q).map((s) => s.key)).toEqual(["b"]);
    expect(retry(q, "b").find((s) => s.key === "b")).toMatchObject({ status: "PENDING", error: undefined });
    expect(discard(q, "b").map((s) => s.key)).toEqual(["a"]);
  });
});

describe("syncing the queue (POS-10)", () => {
  const queueOf = (...keys: string[]) => keys.reduce<QueuedSale[]>((q, k, i) => enqueue(q, sale(k, i)), []);

  it("sends everything in order and empties the queue", async () => {
    const order: string[] = [];
    const send: Send = async (r) => {
      order.push(r.idempotencyKey);
      return ok(r.idempotencyKey);
    };
    const out = await syncQueue(queueOf("a", "b", "c"), send);
    expect(order).toEqual(["a", "b", "c"]);
    expect(out.queue).toEqual([]);
    expect(out.sent.map((s) => s.key)).toEqual(["a", "b", "c"]);
    expect(out.stopped).toBeNull();
  });
  it("stops at the first sale when there is no signal, keeping all of them", async () => {
    let calls = 0;
    const send: Send = async () => {
      calls += 1;
      throw new TypeError("Network request failed");
    };
    const out = await syncQueue(queueOf("a", "b"), send);
    expect(calls).toBe(1);
    expect(out.stopped).toBe("offline");
    expect(out.queue.map((s) => [s.key, s.status, s.attempts])).toEqual([["a", "PENDING", 1], ["b", "PENDING", 0]]);
  });
  it("keeps what was sent before the signal dropped", async () => {
    const send: Send = async (r) => {
      if (r.idempotencyKey === "b") throw httpError(503);
      return ok(r.idempotencyKey);
    };
    const out = await syncQueue(queueOf("a", "b", "c"), send);
    expect(out.sent.map((s) => s.key)).toEqual(["a"]);
    expect(out.queue.map((s) => s.key)).toEqual(["b", "c"]);
    expect(out.stopped).toBe("server");
  });
  it("waits for a sign-in when the session has ended", async () => {
    const out = await syncQueue(queueOf("a"), async () => {
      throw httpError(401);
    });
    expect(out.stopped).toBe("sign-in");
    expect(out.queue[0]).toMatchObject({ status: "PENDING" });
  });
  it("parks a refused sale for review and carries on with the rest", async () => {
    const send: Send = async (r) => {
      if (r.idempotencyKey === "a") throw httpError(409, "Moth is already sold.");
      return ok(r.idempotencyKey);
    };
    const out = await syncQueue(queueOf("a", "b"), send);
    expect(out.stopped).toBeNull();
    expect(out.sent.map((s) => s.key)).toEqual(["b"]);
    expect(out.queue).toHaveLength(1);
    expect(out.queue[0]).toMatchObject({ key: "a", status: "NEEDS_REVIEW", error: "Moth is already sold.", attempts: 1 });
  });
  it("leaves sales that need review alone", async () => {
    let calls = 0;
    const q = queueOf("a").map((s) => ({ ...s, status: "NEEDS_REVIEW" as const }));
    await syncQueue(q, async () => {
      calls += 1;
      return ok("a");
    });
    expect(calls).toBe(0);
  });
  it("sends the same key every time, so a lost reply can't record a sale twice", async () => {
    const seen: string[] = [];
    let first = true;
    const send: Send = async (r) => {
      seen.push(r.idempotencyKey);
      if (first) {
        first = false;
        throw new TypeError("Network request failed");
      }
      return ok(r.idempotencyKey);
    };
    const q1 = await syncQueue(queueOf("a"), send);
    const q2 = await syncQueue(q1.queue, send);
    expect(seen).toEqual(["a", "a"]);
    expect(q2.queue).toEqual([]);
  });
});

describe("sale keys", () => {
  it("are long, different and safe for the API", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newSaleKey()));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(k).toMatch(/^pos-[0-9a-z]+-[0-9a-z]{18}$/);
    expect([...keys][0]!.length).toBeGreaterThanOrEqual(8);
    expect([...keys][0]!.length).toBeLessThanOrEqual(64);
  });
});
