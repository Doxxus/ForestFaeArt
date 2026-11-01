export interface LockoutState {
  failedLogins: number;
  lockedUntil: Date | null;
}

export const LOCKOUT_THRESHOLD = 5;
const BASE_LOCK_MS = 60_000;
const MAX_LOCK_MS = 15 * 60_000;

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

// After the threshold, each further failure doubles the lock time up to 15 minutes.
export function recordFailure(state: LockoutState, now: Date): LockoutState {
  const failedLogins = state.failedLogins + 1;
  if (failedLogins < LOCKOUT_THRESHOLD) return { failedLogins, lockedUntil: state.lockedUntil };
  const steps = failedLogins - LOCKOUT_THRESHOLD;
  const ms = Math.min(BASE_LOCK_MS * 2 ** steps, MAX_LOCK_MS);
  return { failedLogins, lockedUntil: new Date(now.getTime() + ms) };
}

export function recordSuccess(): LockoutState {
  return { failedLogins: 0, lockedUntil: null };
}
