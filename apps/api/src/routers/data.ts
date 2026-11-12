import { adminProcedure, router } from "../trpc";
import { backupSummary, exportBundle } from "../services/export";
import { runDatabaseBackup } from "../services/backup";
import { writeAudit } from "../services/audit";

export const dataRouter = router({
  /** Every spreadsheet in "Export my data". Administrator only: it includes what pieces cost. */
  exportAll: adminProcedure.query(async ({ ctx }) => {
    const files = await exportBundle(ctx.db);
    await writeAudit(ctx.db, { userId: ctx.user.id, action: "data.export", entityType: "export", ip: ctx.ip });
    return { files };
  }),
  backupStatus: adminProcedure.query(({ ctx }) => backupSummary(ctx.env)),
  /** "Back up now", for before a big change. The nightly job does the same thing. */
  backupNow: adminProcedure.mutation(async ({ ctx }) => {
    const state = await runDatabaseBackup(ctx.env);
    await writeAudit(ctx.db, { userId: ctx.user.id, action: "data.backup", entityType: "backup", entityId: state.key ?? null, diff: { ok: state.ok }, ip: ctx.ip });
    return state;
  }),
});
