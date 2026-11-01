import { LOCKOUT_THRESHOLD, isLocked, recordFailure, recordSuccess, type LockoutState } from "./lockout";
import { DEFAULT_SCRYPT, hashPassword, needsRehash, verifyPassword } from "./password";
import { signSessionToken } from "./token";
import type { Role } from "./authorize";

export interface StoredUser extends LockoutState {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  passwordHash: string | null;
  sessionVersion: number;
}

/** The only database access login needs, so the rules can be tested without a database. */
export interface LoginStore {
  findByEmail(email: string): Promise<StoredUser | null>;
  saveLockout(userId: string, state: LockoutState): Promise<void>;
  savePasswordHash(userId: string, hash: string): Promise<void>;
}

export type LoginResult =
  | { ok: true; token: string; user: { id: string; name: string; role: Role } }
  | { ok: false; message: string; internalReason: "UNKNOWN_USER" | "BAD_PASSWORD" | "INACTIVE" | "LOCKED" | "NO_PASSWORD" };

// One message for every failure so the response never reveals whether an account exists or is locked.
export const LOGIN_FAILED_MESSAGE =
  "That email and password don't match, or the account is temporarily locked. Please try again in a few minutes.";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function login(
  store: LoginStore,
  input: { email: string; password: string },
  opts: { secret: string; ttlSeconds: number; now?: Date },
): Promise<LoginResult> {
  const now = opts.now ?? new Date();
  const user = await store.findByEmail(normalizeEmail(input.email));
  const fail = (internalReason: Extract<LoginResult, { ok: false }>["internalReason"]): LoginResult => ({
    ok: false,
    message: LOGIN_FAILED_MESSAGE,
    internalReason,
  });

  // Always spend the hashing time, even for unknown, locked or password-less accounts.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? "");

  if (!user) return fail("UNKNOWN_USER");
  if (isLocked(user, now)) return fail("LOCKED");
  if (!user.passwordHash) return fail("NO_PASSWORD");

  if (!passwordOk) {
    await store.saveLockout(user.id, recordFailure(user, now));
    return fail("BAD_PASSWORD");
  }
  if (!user.active) return fail("INACTIVE");

  await store.saveLockout(user.id, recordSuccess());
  if (needsRehash(user.passwordHash, DEFAULT_SCRYPT)) {
    await store.savePasswordHash(user.id, await hashPassword(input.password));
  }
  const token = await signSessionToken({ userId: user.id, sessionVersion: user.sessionVersion }, opts.secret, {
    ttlSeconds: opts.ttlSeconds,
    now,
  });
  return { ok: true, token, user: { id: user.id, name: user.name, role: user.role } };
}

export { LOCKOUT_THRESHOLD };
