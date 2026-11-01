import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

// About 64 MB of memory and 0.2 s on Workers (see ADR 003). N=2^17 is too close to the 128 MB Worker limit.
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 16, r: 8, p: 1 };

const KEY_LEN = 32;
const SALT_LEN = 16;
const MAX_MEM = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, { N, r, p, maxmem: MAX_MEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

// Stored as scrypt$N$r$p$salt$hash so the cost can be raised later and old hashes upgraded on sign-in.
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

function parseStored(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every((v) => Number.isInteger(v) && v > 0)) return null;
  if (params.N > 2 ** 17 || params.N & (params.N - 1)) return null;
  return { params, salt: Buffer.from(salt, "base64url"), key: Buffer.from(key, "base64url") };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = stored ? parseStored(stored) : null;
  if (!parsed) {
    // Spend comparable time so an unknown user and a wrong password are indistinguishable.
    await derive(password, Buffer.alloc(SALT_LEN), DEFAULT_SCRYPT);
    return false;
  }
  const candidate = await derive(password, parsed.salt, parsed.params);
  return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
}

export function needsRehash(stored: string, target: ScryptParams = DEFAULT_SCRYPT): boolean {
  const parsed = parseStored(stored);
  return !parsed || parsed.params.N !== target.N || parsed.params.r !== target.r || parsed.params.p !== target.p;
}
