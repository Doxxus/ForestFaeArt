/** The nightly database backup, in UTC (about 2 am in Toronto). The 15-minute health check is the other schedule. Keep in step with wrangler.jsonc. */
export const NIGHTLY_CRON = "17 7 * * *";
