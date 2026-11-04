/** Cloudflare Turnstile: the "are you a person" check on the public contact form (WEB-7). */
export async function verifyTurnstile(secret: string, token: string | undefined, ip: string | null, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // If the check can't run we refuse rather than let anything through.
    return false;
  }
}
