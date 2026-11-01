import { describe, expect, it } from "vitest";
import {
  LOCKOUT_THRESHOLD,
  authorize,
  checkPassword,
  createOneTimeToken,
  hashOneTimeToken,
  hashPassword,
  isLocked,
  isTokenUsable,
  needsRehash,
  recordFailure,
  recordSuccess,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type UserRecord,
} from "./index";

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const SECRET = "x".repeat(40);
const now = new Date("2026-12-01T12:00:00Z");

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple", FAST);
    expect(stored.startsWith("scrypt$1024$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", stored)).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    expect(await hashPassword("same password here", FAST)).not.toBe(await hashPassword("same password here", FAST));
  });
  it("rejects malformed or unsafe stored values without throwing", async () => {
    expect(await verifyPassword("anything at all", "")).toBe(false);
    expect(await verifyPassword("anything at all", "plain-text")).toBe(false);
    expect(await verifyPassword("anything at all", "scrypt$1073741824$8$1$AA$AA")).toBe(false);
    expect(await verifyPassword("anything at all", "scrypt$1000$8$1$AA$AA")).toBe(false);
  });
  it("uses the production cost by default and flags weaker hashes for upgrade", async () => {
    const stored = await hashPassword("a long enough password");
    expect(stored.startsWith("scrypt$65536$8$1$")).toBe(true);
    expect(needsRehash(stored)).toBe(false);
    expect(needsRehash(await hashPassword("a long enough password", FAST))).toBe(true);
  });
});

describe("password policy", () => {
  it("accepts a long passphrase", () => {
    expect(checkPassword("moss and mushrooms after rain")).toEqual([]);
  });
  it("flags short, common, repetitive and email-based passwords", () => {
    expect(checkPassword("short")).toContain("TOO_SHORT");
    expect(checkPassword("Password123")).toContain("TOO_COMMON");
    expect(checkPassword("aaaaaaaaaaaaaa")).toContain("REPETITIVE");
    expect(checkPassword("asa-is-the-best-2026", { email: "asa@forestfae.ca" })).toEqual([]);
    expect(checkPassword("owner-sally-2026-secret", { email: "sally@forestfae.ca" })).toContain("CONTAINS_EMAIL");
    expect(checkPassword("x".repeat(129))).toContain("TOO_LONG");
  });
});

describe("session tokens", () => {
  it("round-trips the claims", async () => {
    const token = await signSessionToken({ userId: "u1", sessionVersion: 3 }, SECRET, { now });
    expect(await verifySessionToken(token, SECRET, { now })).toEqual({ userId: "u1", sessionVersion: 3 });
  });
  it("rejects expired, tampered, wrong-secret and garbage tokens", async () => {
    const token = await signSessionToken({ userId: "u1", sessionVersion: 1 }, SECRET, { now, ttlSeconds: 60 });
    expect(await verifySessionToken(token, SECRET, { now: new Date(now.getTime() + 61_000) })).toBeNull();
    expect(await verifySessionToken(token + "x", SECRET, { now })).toBeNull();
    expect(await verifySessionToken(token, "y".repeat(40), { now })).toBeNull();
    expect(await verifySessionToken("not-a-token", SECRET, { now })).toBeNull();
  });
  it("rejects a token that claims no algorithm", async () => {
    const none = `${btoa('{"alg":"none"}')}.${btoa('{"sub":"u1","sv":1}')}.`;
    expect(await verifySessionToken(none, SECRET, { now })).toBeNull();
  });
  it("refuses a weak secret", async () => {
    await expect(signSessionToken({ userId: "u1", sessionVersion: 1 }, "short")).rejects.toThrow();
  });
  it("does not put the role in the token", async () => {
    const token = await signSessionToken({ userId: "u1", sessionVersion: 1 }, SECRET, { now });
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload).not.toHaveProperty("role");
  });
});

describe("authorize", () => {
  const user: UserRecord = { id: "u1", role: "STAFF", active: true, sessionVersion: 2 };
  const claims = { userId: "u1", sessionVersion: 2 };
  it("allows an active, current, permitted user", () => {
    expect(authorize(claims, user, ["ADMIN", "STAFF"])).toEqual({ ok: true, user });
  });
  it("rejects STAFF on admin-only procedures", () => {
    expect(authorize(claims, user, ["ADMIN"])).toEqual({ ok: false, reason: "FORBIDDEN" });
  });
  it("rejects revoked sessions after sessionVersion changes", () => {
    expect(authorize(claims, { ...user, sessionVersion: 3 }, ["STAFF"])).toEqual({ ok: false, reason: "REVOKED" });
  });
  it("rejects inactive users, missing users and mismatched ids", () => {
    expect(authorize(claims, { ...user, active: false }, ["STAFF"])).toEqual({ ok: false, reason: "INACTIVE" });
    expect(authorize(claims, null, ["STAFF"])).toEqual({ ok: false, reason: "NO_SESSION" });
    expect(authorize(null, user, ["STAFF"])).toEqual({ ok: false, reason: "NO_SESSION" });
    expect(authorize({ ...claims, userId: "other" }, user, ["STAFF"])).toEqual({ ok: false, reason: "NO_SESSION" });
  });
  it("uses the freshly loaded role, so a demoted admin loses access immediately", () => {
    expect(authorize(claims, { ...user, role: "STAFF" }, ["ADMIN"])).toEqual({ ok: false, reason: "FORBIDDEN" });
  });
});

describe("lockout", () => {
  it("locks after the threshold and backs off", () => {
    let s = recordSuccess();
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) s = recordFailure(s, now);
    expect(isLocked(s, now)).toBe(false);
    s = recordFailure(s, now);
    expect(isLocked(s, now)).toBe(true);
    expect(s.lockedUntil!.getTime() - now.getTime()).toBe(60_000);
    s = recordFailure(s, now);
    expect(s.lockedUntil!.getTime() - now.getTime()).toBe(120_000);
  });
  it("caps the lock at 15 minutes and clears on success", () => {
    let s = recordSuccess();
    for (let i = 0; i < 30; i++) s = recordFailure(s, now);
    expect(s.lockedUntil!.getTime() - now.getTime()).toBe(15 * 60_000);
    expect(isLocked(recordSuccess(), now)).toBe(false);
  });
  it("unlocks when the time has passed", () => {
    let s = recordSuccess();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) s = recordFailure(s, now);
    expect(isLocked(s, new Date(now.getTime() + 61_000))).toBe(false);
  });
});

describe("one-time tokens", () => {
  it("stores only a hash that matches the token", () => {
    const { token, tokenHash } = createOneTimeToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(tokenHash).toBe(hashOneTimeToken(token));
    expect(tokenHash).not.toContain(token);
  });
  it("is single use and expires", () => {
    const future = new Date(now.getTime() + 1000);
    expect(isTokenUsable({ expiresAt: future, usedAt: null }, now)).toBe(true);
    expect(isTokenUsable({ expiresAt: future, usedAt: now }, now)).toBe(false);
    expect(isTokenUsable({ expiresAt: new Date(now.getTime() - 1), usedAt: null }, now)).toBe(false);
    expect(isTokenUsable(null, now)).toBe(false);
  });
});
