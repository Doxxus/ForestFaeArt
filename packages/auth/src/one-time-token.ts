import { randomBytes, createHash } from "node:crypto";

// 256-bit one-time token for set-password and reset links. Only the hash is stored.
export function createOneTimeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOneTimeToken(token) };
}

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const ONE_TIME_TOKEN_TTL_MS = 60 * 60_000;

export function isTokenUsable(
  record: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date,
): record is { expiresAt: Date; usedAt: null } {
  return record !== null && record.usedAt === null && record.expiresAt.getTime() > now.getTime();
}
