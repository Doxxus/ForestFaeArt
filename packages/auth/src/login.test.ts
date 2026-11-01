import { beforeAll, describe, expect, it } from "vitest";
import {
  LOCKOUT_THRESHOLD,
  LOGIN_FAILED_MESSAGE,
  hashPassword,
  login,
  verifySessionToken,
  type LockoutState,
  type LoginStore,
  type StoredUser,
} from "./index";

const SECRET = "s".repeat(40);
const now = new Date("2026-12-01T12:00:00Z");
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const opts = { secret: SECRET, ttlSeconds: 3600, now };

function fakeStore(initial: StoredUser[]) {
  const users = new Map(initial.map((u) => [u.id, { ...u }]));
  const store: LoginStore & { users: typeof users } = {
    users,
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null;
    },
    async saveLockout(id, state: LockoutState) {
      Object.assign(users.get(id)!, state);
    },
    async savePasswordHash(id, hash) {
      users.get(id)!.passwordHash = hash;
    },
  };
  return store;
}

let hash: string;
const base = (): StoredUser => ({
  id: "u1",
  email: "asa@forestfae.ca",
  name: "Asa",
  role: "ADMIN",
  active: true,
  passwordHash: hash,
  sessionVersion: 4,
  failedLogins: 0,
  lockedUntil: null,
});

beforeAll(async () => {
  hash = await hashPassword("moss and mushrooms after rain", FAST);
});

describe("login", () => {
  it("signs in with the right password, ignoring email case and spaces", async () => {
    const store = fakeStore([base()]);
    const r = await login(store, { email: "  ASA@forestfae.ca ", password: "moss and mushrooms after rain" }, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user).toEqual({ id: "u1", name: "Asa", role: "ADMIN" });
      expect(await verifySessionToken(r.token, SECRET, { now })).toEqual({ userId: "u1", sessionVersion: 4 });
    }
  });

  it("upgrades a weaker stored hash to the production cost on successful sign-in", async () => {
    const store = fakeStore([base()]);
    await login(store, { email: "asa@forestfae.ca", password: "moss and mushrooms after rain" }, opts);
    expect(store.users.get("u1")!.passwordHash!.startsWith("scrypt$65536$8$1$")).toBe(true);
  });

  it("gives the same message for unknown user, wrong password, inactive and locked accounts", async () => {
    const store = fakeStore([
      base(),
      { ...base(), id: "u2", email: "off@forestfae.ca", active: false },
      { ...base(), id: "u3", email: "locked@forestfae.ca", lockedUntil: new Date(now.getTime() + 60_000) },
    ]);
    const pw = "moss and mushrooms after rain";
    const results = await Promise.all([
      login(store, { email: "nobody@forestfae.ca", password: pw }, opts),
      login(store, { email: "asa@forestfae.ca", password: "wrong password here" }, opts),
      login(store, { email: "off@forestfae.ca", password: pw }, opts),
      login(store, { email: "locked@forestfae.ca", password: pw }, opts),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toBe(LOGIN_FAILED_MESSAGE);
    }
    expect(results.map((r) => (r.ok ? "" : r.internalReason))).toEqual([
      "UNKNOWN_USER",
      "BAD_PASSWORD",
      "INACTIVE",
      "LOCKED",
    ]);
  });

  it("locks the account after repeated failures, and a locked account rejects even the right password", async () => {
    const store = fakeStore([base()]);
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await login(store, { email: "asa@forestfae.ca", password: "wrong password here" }, opts);
    }
    expect(store.users.get("u1")!.lockedUntil).not.toBeNull();
    const r = await login(store, { email: "asa@forestfae.ca", password: "moss and mushrooms after rain" }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.internalReason).toBe("LOCKED");
    const later = await login(
      store,
      { email: "asa@forestfae.ca", password: "moss and mushrooms after rain" },
      { ...opts, now: new Date(now.getTime() + 2 * 60_000) },
    );
    expect(later.ok).toBe(true);
  });

  it("resets the failure count on success", async () => {
    const store = fakeStore([{ ...base(), failedLogins: 3 }]);
    await login(store, { email: "asa@forestfae.ca", password: "moss and mushrooms after rain" }, opts);
    expect(store.users.get("u1")!.failedLogins).toBe(0);
  });

  it("rejects accounts that have no password yet", async () => {
    const store = fakeStore([{ ...base(), passwordHash: null }]);
    const r = await login(store, { email: "asa@forestfae.ca", password: "anything at all here" }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.internalReason).toBe("NO_PASSWORD");
  });

  it("does not count failures against an inactive account's lockout as a success", async () => {
    const store = fakeStore([{ ...base(), active: false }]);
    const r = await login(store, { email: "asa@forestfae.ca", password: "moss and mushrooms after rain" }, opts);
    expect(r.ok).toBe(false);
    expect(store.users.get("u1")!.failedLogins).toBe(0);
  });
});
