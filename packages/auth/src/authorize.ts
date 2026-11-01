export type Role = "ADMIN" | "STAFF";

export interface UserRecord {
  id: string;
  role: Role;
  active: boolean;
  sessionVersion: number;
}

export type AuthFailure = "NO_SESSION" | "INACTIVE" | "REVOKED" | "FORBIDDEN";

export type AuthResult = { ok: true; user: UserRecord } | { ok: false; reason: AuthFailure };

// Evaluated on every API request against the freshly loaded D1 row. Nothing about role comes from the token.
export function authorize(
  claims: { userId: string; sessionVersion: number } | null,
  user: UserRecord | null,
  allowed: readonly Role[],
): AuthResult {
  if (!claims || !user || user.id !== claims.userId) return { ok: false, reason: "NO_SESSION" };
  if (!user.active) return { ok: false, reason: "INACTIVE" };
  if (user.sessionVersion !== claims.sessionVersion) return { ok: false, reason: "REVOKED" };
  if (!allowed.includes(user.role)) return { ok: false, reason: "FORBIDDEN" };
  return { ok: true, user };
}

export const ROLES = {
  anyUser: ["ADMIN", "STAFF"],
  adminOnly: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;
