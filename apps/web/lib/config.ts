/** Where the API Worker lives. Set per environment in .env.development and .env.production (the staging URL for now). */
export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export const SESSION_COOKIE = "ffa_session";
/** Holds a one-time set-password link for two minutes after an invitation, so it never sits in the address bar. */
export const LINK_COOKIE = "ffa_link";
/** Matches the API's web session length (12 hours). The API is the authority: an expired token is simply rejected. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
