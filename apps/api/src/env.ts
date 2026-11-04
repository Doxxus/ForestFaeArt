export interface Env {
  DB: D1Database;
  /** Product and event images, QR codes and labels. Never store images in the database. */
  MEDIA: R2Bucket;
  /** Worker secret, at least 32 characters. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
  ENVIRONMENT: "local" | "staging" | "production";
  /** Origin of the web app, used to build set-password and reset links. No trailing slash. */
  WEB_ORIGIN: string;
  /** Shared with the web Worker so it can forward visitor addresses. Optional. Set with `wrangler secret put INTERNAL_SECRET`. */
  INTERNAL_SECRET?: string;
  /** Resend API key. Without it, outgoing email waits (see ADR 010). Set with `wrangler secret put RESEND_API_KEY`. */
  RESEND_API_KEY?: string;
  /** Turnstile secret key for the public contact form. Without it the form relies on rate limiting and a hidden trap field only. */
  TURNSTILE_SECRET?: string;
  /** Cloudflare Images binding for resized photos. Optional: without it the original is served. */
  IMAGES?: ImagesBinding;
}
