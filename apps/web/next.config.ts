import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

// The address of the API this build talks to. Set by scripts/deploy.mjs for each environment, so the policy matches it.
const apiOrigin = new URL(process.env.VITE_API_URL ?? "https://ffa-api-staging.forestfaefolk.workers.dev").origin;

const nextConfig: NextConfig = {
  async redirects() {
    // The site has one address. www goes to the bare domain, so search engines and QR codes never see two.
    if (process.env.FFA_ENV !== "production") return [];
    return [{ source: "/:path*", has: [{ type: "host", value: "www.forestfae.ca" }], destination: "https://forestfae.ca/:path*", permanent: true }];
  },
  async headers() {
    // The dev server needs eval and live reload, so the strict policy is only for built sites.
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: securityHeaders({ apiOrigin, production: true }) }];
  },
};

export default nextConfig;
