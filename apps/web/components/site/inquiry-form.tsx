import { TURNSTILE_SITE_KEY } from "@/lib/site-config";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { sendInquiryAction } from "@/app/(site)/inquiry-actions";

/**
 * The contact and "Ask about this piece" form (WEB-7, WEB-8). A plain form that posts to a server action, so it works without JavaScript.
 * Spam defences: a hidden trap field, the API's per-visitor limit, and Cloudflare Turnstile when a site key is configured.
 */
export function InquiryForm({ sku, returnTo, submitLabel = "Send message", messageHint }: { sku?: string; returnTo: string; submitLabel?: string; messageHint?: string }) {
  return (
    <form action={sendInquiryAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {sku ? <input type="hidden" name="sku" value={sku} /> : null}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor={`name-${sku ?? "contact"}`}>
          <Input id={`name-${sku ?? "contact"}`} name="name" required maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Your email" htmlFor={`email-${sku ?? "contact"}`} hint="So we can write back. We never share it.">
          <Input id={`email-${sku ?? "contact"}`} name="email" type="email" required maxLength={254} autoComplete="email" />
        </Field>
      </div>
      <Field label="Your message" htmlFor={`message-${sku ?? "contact"}`} hint={messageHint}>
        <Textarea id={`message-${sku ?? "contact"}`} name="message" rows={6} required minLength={5} maxLength={4000} />
      </Field>
      {/* Real visitors never see or reach this. Bots fill it in and are quietly ignored. */}
      <div className="trap-field" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {TURNSTILE_SITE_KEY ? (
        <>
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile mb-4" data-sitekey={TURNSTILE_SITE_KEY} />
        </>
      ) : null}
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
