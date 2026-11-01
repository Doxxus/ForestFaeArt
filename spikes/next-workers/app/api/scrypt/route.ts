import { scrypt, randomBytes } from "node:crypto";

export async function GET(req: Request) {
  const log2n = Number(new URL(req.url).searchParams.get("n") ?? "15");
  const salt = randomBytes(16);
  const started = Date.now();
  const hash = await new Promise<Buffer>((resolve, reject) =>
    scrypt("correct horse battery", salt, 32, { N: 2 ** log2n, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (e, k) =>
      e ? reject(e) : resolve(k),
    ),
  );
  return Response.json({ N: 2 ** log2n, hashLen: hash.length, wallMs: Date.now() - started });
}
