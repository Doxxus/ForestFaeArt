/**
 * Builds and deploys the web app to one environment (docs/runbook.md, "Deploy").
 *
 *   pnpm deploy:staging
 *   pnpm deploy:production
 *
 * The address of the API and of the site are baked in when the site is built, so each environment sets them here
 * rather than in a shared .env file. Nothing secret belongs in this file.
 */
import { spawnSync } from "node:child_process";

const TARGETS = {
  staging: {
    FFA_ENV: "staging",
    VITE_API_URL: "https://ffa-api-staging.forestfaefolk.workers.dev",
    VITE_SITE_URL: "https://ffa-web-staging.forestfaefolk.workers.dev",
    // Search engines stay out of staging.
    VITE_INDEXABLE: "",
  },
  production: {
    FFA_ENV: "production",
    VITE_API_URL: "https://api.forestfae.ca",
    VITE_SITE_URL: "https://forestfae.ca",
    // Still hidden from search engines until the owner presses "Publish my website" (ADR 011).
    VITE_INDEXABLE: "true",
  },
};

const name = process.argv[2];
const target = TARGETS[name];
if (!target) {
  console.error(`Usage: node scripts/deploy.mjs <${Object.keys(TARGETS).join("|")}>`);
  process.exit(1);
}

console.log(`Deploying the web app to ${name}...`);
const result = spawnSync("pnpm", ["exec", "vinext-cloudflare", "deploy"], { stdio: "inherit", shell: true, env: { ...process.env, ...target } });
process.exit(result.status ?? 1);
