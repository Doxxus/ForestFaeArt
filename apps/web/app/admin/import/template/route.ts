import { IMPORT_TEMPLATE_CSV } from "@ffa/validators";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  return new Response(IMPORT_TEMPLATE_CSV, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="inventory_import_template.csv"',
      "cache-control": "no-store",
    },
  });
}
