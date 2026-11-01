import { drizzle, eq, users } from "@ffa/db";
import type { LoginStore, StoredUser, UserRecord } from "@ffa/auth";

export type Db = ReturnType<typeof makeDb>;

export const makeDb = (d1: D1Database) => drizzle(d1);

export function loginStore(db: Db): LoginStore {
  return {
    async findByEmail(email): Promise<StoredUser | null> {
      const row = await db.select().from(users).where(eq(users.email, email)).get();
      return row ?? null;
    },
    async saveLockout(userId, state) {
      await db
        .update(users)
        .set({ failedLogins: state.failedLogins, lockedUntil: state.lockedUntil })
        .where(eq(users.id, userId));
    },
    async savePasswordHash(userId, hash) {
      await db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId));
    },
  };
}

/** Loaded on every authenticated request. Role, active flag and sessionVersion always come from here, never the token. */
export async function loadUserRecord(db: Db, id: string): Promise<UserRecord | null> {
  const row = await db
    .select({ id: users.id, role: users.role, active: users.active, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, id))
    .get();
  return row ?? null;
}
