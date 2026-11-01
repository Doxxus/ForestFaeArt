export interface Env {
  DB: D1Database;
  /** Product and event images, QR codes and labels. Never store images in the database. */
  MEDIA: R2Bucket;
  /** Worker secret, at least 32 characters. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
  ENVIRONMENT: "local" | "staging" | "production";
}
