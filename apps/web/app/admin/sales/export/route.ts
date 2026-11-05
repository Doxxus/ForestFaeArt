import { getCurrentUser, serverApi } from "@/lib/session";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  const q = new URL(req.url).searchParams;
  const day = (k: string) => (DAY.test(q.get(k) ?? "") ? (q.get(k) as string) : undefined);
  const number = Number.parseInt(q.get("number") ?? "", 10) || undefined;
  const csv = await (await serverApi()).sales.exportCsv.query({
    from: day("from"),
    to: day("to"),
    channel: (q.get("channel") || undefined) as never,
    method: (q.get("method") || undefined) as never,
    status: (q.get("status") || undefined) as never,
    eventId: q.get("event") || undefined,
    number,
  });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sales-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
