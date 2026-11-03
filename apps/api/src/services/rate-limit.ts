import { sql } from "@ffa/db";
import type { Db } from "../store";

export interface RateLimitRule {
  /** Maximum attempts allowed per window. */
  limit: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Named rules. Login is also locked out per account (packages/auth), this is the per-IP layer (AUTH-8). */
export const RATE_LIMITS = {
  loginPerIp: { limit: 20, windowMs: 15 * 60_000 },
  tokenRedeemPerIp: { limit: 10, windowMs: 15 * 60_000 },
  inquiryPerIp: { limit: 5, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter kept in D1 so it needs no extra service or plan. One atomic upsert per call.
 * Every attempt counts, whether or not it later succeeds.
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const expiredBefore = now - rule.windowMs;
  const rows = await db.all<{ count: number; window_start: number }>(sql`
    INSERT INTO rate_limit (key, window_start, count) VALUES (${key}, ${now}, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start <= ${expiredBefore} THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start <= ${expiredBefore} THEN ${now} ELSE window_start END
    RETURNING count, window_start
  `);
  const row = rows[0];
  if (!row) return { allowed: true };

  // Housekeeping when a new window starts, so the table never grows without bound.
  if (row.count === 1) await db.run(sql`DELETE FROM rate_limit WHERE window_start < ${now - 24 * 60 * 60_000}`);

  if (row.count <= rule.limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((row.window_start + rule.windowMs - now) / 1000)) };
}
