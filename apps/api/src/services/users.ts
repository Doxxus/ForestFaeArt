import { and, authTokens, eq, isNull, sql, users } from "@ffa/db";
import {
  ONE_TIME_TOKEN_TTL_MS,
  PASSWORD_MESSAGES,
  checkPassword,
  createOneTimeToken,
  hashOneTimeToken,
  hashPassword,
  isTokenUsable,
  normalizeEmail,
} from "@ffa/auth";
import { newId, type UserRole } from "@ffa/validators";
import { auditStatement } from "./audit";
import type { Db } from "../store";

/** A new colleague has a week to open their set-password link. Reset links are short-lived. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
export const RESET_TTL_MS = ONE_TIME_TOKEN_TTL_MS;

export type TokenPurpose = "SET_PASSWORD" | "RESET";

export type UserServiceError = {
  ok: false;
  code: "NOT_FOUND" | "EMAIL_TAKEN" | "LAST_ADMIN" | "INVALID_TOKEN" | "WEAK_PASSWORD" | "INACTIVE";
  message: string;
};
const fail = (code: UserServiceError["code"], message: string): UserServiceError => ({ ok: false, code, message });

const tokenTtl = (purpose: TokenPurpose) => (purpose === "SET_PASSWORD" ? INVITE_TTL_MS : RESET_TTL_MS);

/** Makes a one-time token for a user. Older unused links for the same user are cancelled so only the newest works. */
async function issueToken(db: Db, userId: string, purpose: TokenPurpose, now: Date) {
  const { token, tokenHash } = createOneTimeToken();
  const expiresAt = new Date(now.getTime() + tokenTtl(purpose));
  await db.batch([
    db.update(authTokens).set({ usedAt: now }).where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt))),
    db.insert(authTokens).values({ id: newId(), userId, purpose, tokenHash, expiresAt }),
  ]);
  return { token, expiresAt };
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  hasPassword: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
}

/** Never includes the password hash. */
export async function listUsers(db: Db): Promise<UserSummary[]> {
  const rows = await db.select().from(users).orderBy(users.createdAt).all();
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    hasPassword: u.passwordHash !== null,
    lockedUntil: u.lockedUntil,
    createdAt: u.createdAt,
  }));
}

export async function inviteUser(
  db: Db,
  actorId: string,
  input: { email: string; name: string; role: UserRole },
  now = new Date(),
): Promise<{ ok: true; userId: string; token: string; expiresAt: Date } | UserServiceError> {
  const email = normalizeEmail(input.email);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) return fail("EMAIL_TAKEN", "Someone with that email already has an account.");

  const userId = newId();
  const { token, tokenHash } = createOneTimeToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await db.batch([
    db.insert(users).values({ id: userId, email, name: input.name.trim(), role: input.role }),
    db.insert(authTokens).values({ id: newId(), userId, purpose: "SET_PASSWORD", tokenHash, expiresAt }),
    auditStatement(db, { userId: actorId, action: "user.invite", entityType: "user", entityId: userId, diff: { email, role: input.role } }),
  ]);
  return { ok: true, userId, token, expiresAt };
}

/** A fresh set-password or reset link for an existing user (AUTH-3). */
export async function reissueLink(
  db: Db,
  actorId: string,
  userId: string,
  now = new Date(),
): Promise<{ ok: true; token: string; expiresAt: Date; purpose: TokenPurpose } | UserServiceError> {
  const user = await db.select({ id: users.id, passwordHash: users.passwordHash, active: users.active }).from(users).where(eq(users.id, userId)).get();
  if (!user) return fail("NOT_FOUND", "That user doesn't exist.");
  if (!user.active) return fail("INACTIVE", "That account is switched off. Switch it on first.");
  const purpose: TokenPurpose = user.passwordHash ? "RESET" : "SET_PASSWORD";
  const issued = await issueToken(db, userId, purpose, now);
  await auditStatement(db, { userId: actorId, action: "user.link", entityType: "user", entityId: userId, diff: { purpose } });
  return { ok: true, ...issued, purpose };
}

export type TokenStatus = { valid: false } | { valid: true; purpose: TokenPurpose; name: string };

export async function checkToken(db: Db, token: string, now = new Date()): Promise<TokenStatus> {
  const row = await db
    .select({ purpose: authTokens.purpose, expiresAt: authTokens.expiresAt, usedAt: authTokens.usedAt, name: users.name, active: users.active })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(eq(authTokens.tokenHash, hashOneTimeToken(token)))
    .get();
  if (!row || !row.active || !isTokenUsable(row, now)) return { valid: false };
  return { valid: true, purpose: row.purpose, name: row.name };
}

const INVALID_LINK = "This link has expired or was already used. Ask the administrator for a new one.";

/** Sets a password from a one-time link. The link works once. Signing in elsewhere stops (sessionVersion + 1). */
export async function redeemToken(
  db: Db,
  input: { token: string; password: string },
  now = new Date(),
): Promise<{ ok: true; userId: string } | UserServiceError> {
  const row = await db
    .select({
      id: authTokens.id,
      userId: authTokens.userId,
      expiresAt: authTokens.expiresAt,
      usedAt: authTokens.usedAt,
      email: users.email,
      active: users.active,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(eq(authTokens.tokenHash, hashOneTimeToken(input.token)))
    .get();
  if (!row || !row.active || !isTokenUsable(row, now)) return fail("INVALID_TOKEN", INVALID_LINK);

  const problems = checkPassword(input.password, { email: row.email });
  if (problems.length) return fail("WEAK_PASSWORD", problems.map((p) => PASSWORD_MESSAGES[p]).join(" "));

  const passwordHash = await hashPassword(input.password);

  // Burn the token first and only continue if this call was the one that used it.
  const burned = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id })
    .all();
  if (!burned.length) return fail("INVALID_TOKEN", INVALID_LINK);

  await db.batch([
    db
      .update(users)
      .set({
        passwordHash,
        failedLogins: 0,
        lockedUntil: null,
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, row.userId)),
    auditStatement(db, { userId: row.userId, action: "user.password.set", entityType: "user", entityId: row.userId }),
  ]);
  return { ok: true, userId: row.userId };
}

/**
 * Changes a user's role, name or active flag. At least one active ADMIN must always exist (AUTH-6): the guard is part of
 * the UPDATE itself, so two administrators cannot demote each other at the same moment.
 */
export async function updateUser(
  db: Db,
  actorId: string,
  userId: string,
  patch: { role?: UserRole; active?: boolean; name?: string },
): Promise<{ ok: true } | UserServiceError> {
  const current = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!current) return fail("NOT_FOUND", "That user doesn't exist.");

  const removesAdmin =
    current.role === "ADMIN" && current.active && ((patch.role !== undefined && patch.role !== "ADMIN") || patch.active === false);
  const otherActiveAdmin = sql`EXISTS (SELECT 1 FROM ${users} o WHERE o.id != ${userId} AND o.role = 'ADMIN' AND o.active = 1)`;

  const updated = await db
    .update(users)
    .set({
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      // Switching an account off also ends every session it has.
      ...(patch.active === false ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
    })
    .where(and(eq(users.id, userId), removesAdmin ? otherActiveAdmin : sql`1 = 1`))
    .returning({ id: users.id })
    .all();
  if (!updated.length) return fail("LAST_ADMIN", "There must always be at least one active administrator.");

  await auditStatement(db, {
    userId: actorId,
    action: "user.update",
    entityType: "user",
    entityId: userId,
    diff: {
      ...(patch.role !== undefined ? { role: { from: current.role, to: patch.role } } : {}),
      ...(patch.active !== undefined ? { active: { from: current.active, to: patch.active } } : {}),
      ...(patch.name !== undefined ? { name: { from: current.name, to: patch.name.trim() } } : {}),
    },
  });
  return { ok: true };
}

/** Signs the user out everywhere, for a lost device (AUTH-5). */
export async function revokeSessions(db: Db, actorId: string, userId: string): Promise<{ ok: true } | UserServiceError> {
  const updated = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ id: users.id })
    .all();
  if (!updated.length) return fail("NOT_FOUND", "That user doesn't exist.");
  await auditStatement(db, { userId: actorId, action: "user.sessions.revoke", entityType: "user", entityId: userId });
  return { ok: true };
}
