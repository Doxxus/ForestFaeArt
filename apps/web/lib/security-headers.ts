/**
 * Security headers for every page the web Worker serves (ADR 016, the "Security" row of the non-functional requirements).
 * Kept as plain data so a test can check it and next.config.ts can hand it to the framework.
 */
export interface SecurityHeaderOptions {
  /** The API Worker's origin (no path). Photos and calendar links come from there. */
  apiOrigin: string;
  /** Set only for built sites. The dev server needs eval and live reload, which a strict policy would break. */
  production: boolean;
}

export interface Header {
  key: string;
  value: string;
}

/**
 * What the pages are allowed to load. Inline scripts and styles are allowed because the framework streams its own
 * inline bootstrap script and the styling uses style attributes. Everything else has to come from this site, the API
 * (photos), Cloudflare's analytics beacon, or Turnstile (when it is switched on).
 */
export function contentSecurityPolicy({ apiOrigin, production }: SecurityHeaderOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com", "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", apiOrigin],
    "font-src": ["'self'"],
    "connect-src": ["'self'", apiOrigin, "https://cloudflareinsights.com"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["https://challenges.cloudflare.com"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (production) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: SecurityHeaderOptions): Header[] {
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Web Bluetooth is how the admin prints to the label printer. Nothing else on the device is ever needed.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(self)" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (opts.production) headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  return headers;
}
