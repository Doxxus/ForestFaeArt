import type { Metadata } from "next";
import { Button, Card, Field, Flash, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { EVENT_TIME_ZONES } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { createEventAction } from "../actions";

export const metadata: Metadata = { title: "Add an event" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser({ admin: true });
  const { error } = await searchParams;
  return (
    <>
      <PageHeader title="Add an event" intro="Start with the basics. You can add opening hours, a picture and pieces on the next page." />
      <Card className="max-w-2xl">
        <Flash error={error} />
        <form action={createEventAction}>
          <Field label="Name of the event" htmlFor="title">
            <Input id="title" name="title" required maxLength={200} autoFocus placeholder="For example, Stratford Winter Market" />
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="startsAt">
              <Input id="startsAt" name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="Ends" htmlFor="endsAt">
              <Input id="endsAt" name="endsAt" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Where in Canada is it?" htmlFor="timezone" hint="Times are for this place, wherever you're sitting when you enter them.">
            <Select id="timezone" name="timezone" defaultValue="America/Toronto">
              {EVENT_TIME_ZONES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Venue (optional)" htmlFor="venue">
            <Input id="venue" name="venue" maxLength={200} placeholder="Market Hall" />
          </Field>
          <Field label="Address (optional)" htmlFor="address">
            <Input id="address" name="address" maxLength={400} placeholder="1 Main St, Stratford ON" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">Create event</Button>
            <LinkButton href="/admin/events" variant="ghost">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}
