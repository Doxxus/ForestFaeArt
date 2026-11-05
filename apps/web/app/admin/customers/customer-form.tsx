import { Button, Checkbox, Field, Input, Textarea } from "@/components/ui";

export interface CustomerValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string;
  marketingConsent?: boolean;
}

export function CustomerForm({ action, values = {}, submit }: { action: (formData: FormData) => Promise<void>; values?: CustomerValues; submit: string }) {
  return (
    <form action={action}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <Input id="firstName" name="firstName" defaultValue={values.firstName ?? ""} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" defaultValue={values.lastName ?? ""} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={values.email ?? ""} maxLength={254} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={values.phone ?? ""} maxLength={40} autoComplete="off" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes" hint="Only you and your staff see these.">
        <Textarea id="notes" name="notes" defaultValue={values.notes ?? ""} maxLength={2000} />
      </Field>
      <Checkbox name="marketingConsent" label="Happy to receive news from the shop" hint="Only tick this if they said yes. It is saved with today's date." defaultChecked={values.marketingConsent ?? false} />
      <Button type="submit">{submit}</Button>
    </form>
  );
}
