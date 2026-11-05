/**
 * Where the API and website live. Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` in the build profile for production.
 * They default to staging, so a development build can never touch the real shop by accident.
 */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "https://ffa-api-staging.forestfaefolk.workers.dev";
export const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL ?? "https://ffa-web-staging.forestfaefolk.workers.dev";

/** How long to wait for the API before treating the phone as offline. Markets have poor signal, so waiting longer just hangs the screen. */
export const REQUEST_TIMEOUT_MS = 12_000;
export const CATALOG_TIMEOUT_MS = 25_000;

/** How often to look for waiting sales and a newer catalog while the app is open. */
export const SYNC_INTERVAL_MS = 20_000;
export const CATALOG_REFRESH_MS = 3 * 60_000;
