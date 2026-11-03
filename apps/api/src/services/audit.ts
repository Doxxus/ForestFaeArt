import { auditLog } from "@ffa/db";
import { newId } from "@ffa/validators";
import type { Db } from "../store";

export interface AuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Changed fields. Anything that looks like a secret is dropped before it is stored. */
  diff?: Record<string, unknown> | null;
  ip?: string | null;
}

const SECRET_KEY = /password|passwd|hash|token|secret|authorization|cookie/i;

/** JSON text of the diff with secret-looking keys removed at any depth, or null when there is nothing to record. */
export function sanitizeDiff(diff: Record<string, unknown> | null | undefined): string | null {
  if (!diff) return null;
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !SECRET_KEY.test(key))
          .map(([key, v]) => [key, clean(v)]),
      );
    }
    return value;
  };
  const cleaned = clean(diff) as Record<string, unknown>;
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
}

/** The insert as a query, so it can be added to a db.batch() and commit or roll back with the change it records. */
export function auditStatement(db: Db, entry: AuditEntry) {
  return db.insert(auditLog).values({
    id: newId(),
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    diff: sanitizeDiff(entry.diff),
    ip: entry.ip ?? null,
  });
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await auditStatement(db, entry);
}

/** Client IP as seen by Cloudflare. Null when absent (local development). */
export function clientIp(req: Request): string | null {
  return req.headers.get("cf-connecting-ip");
}
