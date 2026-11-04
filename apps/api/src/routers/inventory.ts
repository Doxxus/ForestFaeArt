import { inventorySummary, inventoryValue } from "../services/product-list";
import { router, staffProcedure } from "../trpc";

export const inventoryRouter = router({
  /** Counts for the dashboard. Money totals are included for ADMIN only, and are not even computed for STAFF (INV-8). */
  summary: staffProcedure.query(async ({ ctx }) => {
    const counts = await inventorySummary(ctx.db);
    if (ctx.user.role !== "ADMIN") return counts;
    return { ...counts, ...(await inventoryValue(ctx.db)) };
  }),
});
