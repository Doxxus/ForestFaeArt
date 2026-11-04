import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "ffa-web-staging",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-30",
    // Lets this Worker call the API's public workers.dev address. Without it Cloudflare refuses (error 1042).
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
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
