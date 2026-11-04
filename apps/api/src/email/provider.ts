import type { Env } from "../env";

export interface EmailMessage {
  /** "Forest Fae Folk Art <noreply@forestfae.ca>" */
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  /** Stops a retry from sending the same message twice, where the provider supports it. */
  idempotencyKey?: string;
}

export type EmailResult = { ok: true; id: string | null } | { ok: false; error: string };

/** The one thing the rest of the app knows about email (EML-2). Swap the adapter to change provider. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
}

/** Strips anything that could add a header line. Used on names and subjects that come from visitors. */
export const oneLine = (s: string, max = 200) => s.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, max);

const RESEND_URL = "https://api.resend.com/emails";

export class ResendProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    // Wrapped because Workers' fetch throws "Illegal invocation" when called as a method of another object.
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async send(m: EmailMessage): Promise<EmailResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await this.fetcher(RESEND_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...(m.idempotencyKey ? { "idempotency-key": m.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: m.from, to: m.to, reply_to: m.replyTo, subject: oneLine(m.subject), text: m.text, html: m.html }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok) return { ok: true, id: body.id ?? null };
      return { ok: false, error: `Email provider said ${res.status}: ${body.message ?? body.name ?? "no details"}`.slice(0, 300) };
    } catch (error) {
      console.error(JSON.stringify({ event: "email-provider-unreachable", name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message.replaceAll(this.apiKey, "[key]") : String(error) }));
      return { ok: false, error: error instanceof Error && error.name === "AbortError" ? "The email provider took too long to answer." : "Couldn't reach the email provider." };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Null when no provider is set up yet, which is normal before the domain is ready. Messages are then left waiting. */
export function emailProviderFor(env: Env): EmailProvider | null {
  return env.RESEND_API_KEY ? new ResendProvider(env.RESEND_API_KEY) : null;
}
