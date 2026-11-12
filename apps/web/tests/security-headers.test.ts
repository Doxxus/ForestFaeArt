import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "../lib/security-headers";

const opts = { apiOrigin: "https://api.forestfae.ca", production: true };

describe("security headers (ADR 016)", () => {
  it("sends the standard set", () => {
    const keys = securityHeaders(opts).map((h) => h.key);
    for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy", "Strict-Transport-Security"]) {
      expect(keys).toContain(key);
    }
  });

  it("leaves HSTS and upgrade-insecure-requests out of development, where the site runs on plain http", () => {
    const dev = securityHeaders({ ...opts, production: false });
    expect(dev.map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(contentSecurityPolicy({ ...opts, production: false })).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy(opts)).toContain("upgrade-insecure-requests");
  });

  it("keeps the site out of frames, plugins and other people's forms", () => {
    const csp = contentSecurityPolicy(opts);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows photos from the API and nothing else outside the site", () => {
    const csp = contentSecurityPolicy(opts);
    expect(csp).toContain("img-src 'self' data: blob: https://api.forestfae.ca");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("still lets the label printer use Bluetooth, and nothing else", () => {
    const policy = securityHeaders(opts).find((h) => h.key === "Permissions-Policy")!.value;
    expect(policy).toContain("bluetooth=(self)");
    for (const denied of ["camera=()", "microphone=()", "geolocation=()"]) expect(policy).toContain(denied);
  });
});
