/** For the uptime check (ADR 016). It only proves the website's own Worker is answering, and says nothing about the owner or the data. */
export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
