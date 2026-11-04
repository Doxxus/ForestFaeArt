/**
 * Public-site settings that differ per environment (ADR 011). Set in .env.development and .env.production.
 * Staging leaves VITE_INDEXABLE unset, so it can never be indexed even when its site is switched live for testing.
 */

/** The address people use for this site. It builds canonical links, the sitemap and social previews. */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL ?? "http://localhost:3100").replace(/\/+$/, "");

/** True only on the real production site. Search engines are allowed in only when this is true and the owner has published. */
export const INDEXABLE: boolean = import.meta.env.VITE_INDEXABLE === "true";

/** The public Turnstile site key. Leave unset to run the contact form without it (staging.md explains how to switch it on). */
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

/** Cloudflare Web Analytics token (privacy-friendly, no cookies, so no banner). Leave unset until one is made in the dashboard. */
export const ANALYTICS_TOKEN: string = import.meta.env.VITE_ANALYTICS_TOKEN ?? "";

/** Search engines may index only the real, published site. */
export const mayIndex = (siteLive: boolean) => INDEXABLE && siteLive;
