import { API_URL, SESSION_COOKIE } from "@/lib/config";
import { assertSameOrigin } from "@/lib/session";
import { cookies } from "next/headers";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * The browser uploads photos here, on our own address, and this passes them to the API with the session token. That way
 * the token stays in its httpOnly cookie and the API needs no cross-site (CORS) access.
 */
export async function POST(req: Request) {
  if (!(await assertSameOrigin(req))) return json({ error: "That request didn't come from this site." }, 403);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return json({ error: "Please sign in again." }, 401);

  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  const alt = url.searchParams.get("alt");
  const target = new URL("/media/upload", API_URL);
  target.searchParams.set("productId", productId);
  if (alt) target.searchParams.set("alt", alt);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": req.headers.get("content-type") ?? "application/octet-stream" },
      body: await req.arrayBuffer(),
    });
  } catch {
    return json({ error: "We couldn't reach the server. Please try again." }, 502);
  }
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
