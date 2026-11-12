import { zip } from "@/lib/zip";
import { getCurrentUser, serverApi } from "@/lib/session";

/** "Download all my data": spreadsheets of everything, in one zip. Administrator only, because it includes what pieces cost. */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  const { files } = await (await serverApi()).data.exportAll.query();
  const encoder = new TextEncoder();
  // A byte-order mark makes Excel read the accents in names correctly.
  const bytes = zip(files.map((f) => ({ name: f.name, bytes: encoder.encode(f.name.endsWith(".csv") ? `\uFEFF${f.content}` : f.content) })));
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="forest-fae-data-${new Date().toISOString().slice(0, 10)}.zip"`,
      "cache-control": "no-store",
    },
  });
}
