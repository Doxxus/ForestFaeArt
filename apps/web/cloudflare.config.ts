import { bindings, defineConfig, defineWorker } from "cf/config";

// Chosen by scripts/deploy.mjs ("staging" or "production"). See docs/runbook.md, "Deploy".
const production = process.env.FFA_ENV === "production";

export default defineConfig({
  worker: defineWorker({
    name: production ? "ffa-web" : "ffa-web-staging",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-30",
    // Lets this Worker call the API's public workers.dev address. Without it Cloudflare refuses (error 1042).
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    // Production answers only on the real domain, so the site has exactly one address.
    ...(production ? { domains: ["forestfae.ca", "www.forestfae.ca"], workersDev: false } : {}),
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});
