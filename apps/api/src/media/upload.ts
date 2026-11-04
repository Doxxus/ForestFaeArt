import type { Env } from "../env";
import { MAX_UPLOAD_BYTES, addProductImage } from "../services/images";
import { makeDb } from "../store";
import { createContext, optionalUser } from "../trpc";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

const STATUS = { NOT_FOUND: 404, INVALID: 400, TOO_LARGE: 413, LIMIT: 400 } as const;

/**
 * POST /media/upload?productId=...&alt=...  with the raw photo as the body and a Bearer session token.
 * The file type comes from the bytes, never from the Content-Type header or the file name.
 */
export async function handleUpload(env: Env, req: Request, url: URL): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ctx = createContext(env, req);
  const user = await optionalUser(ctx);
  if (!user) return json({ error: "Please sign in again." }, 401);

  const productId = url.searchParams.get("productId") ?? "";
  if (!productId || productId.length > 40) return json({ error: "Missing item." }, 400);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) return json({ error: "That photo is too large. Please choose a smaller one." }, 413);

  const bytes = new Uint8Array(await req.arrayBuffer());
  const result = await addProductImage(makeDb(env.DB), env.MEDIA, user.id, {
    productId,
    bytes,
    altText: url.searchParams.get("alt") ?? undefined,
  });
  if (!result.ok) return json({ error: result.message }, STATUS[result.code]);
  return json({ image: result.image }, 201);
}
