const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48-bit millisecond timestamp plus 80 random bits, Crockford base32, sortable by creation time. */
export function newId(now: number = Date.now(), random: (n: number) => Uint8Array = randomBytes): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i]! & 31];
  return time + rand;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export const ulidSchemaPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
