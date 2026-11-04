import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { utcMsToLocal } from "@ffa/validators";
import { PhotoPlaceholder } from "@/components/placeholder";
import { PhotoUploader } from "@/components/photo-uploader";
import { Alert, Badge, Button, Card, Field, Flash, Input, PageHeader, Select, Textarea, buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { EVENT_TIME_ZONES, STATUS_LABELS, STATUS_TONE, eventRange, photoUrl } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { archiveEventAction, assignPiecesAction, duplicateEventAction, removeEventImageAction, unassignPieceAction, updateEventAction } from "../actions";

export const metadata: Metadata = { title: "Event" };

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string; find?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const { saved, error, find } = await searchParams;
  const api = await serverApi();

  let event;
  try {
    event = await api.events.get.query({ idOrSlug: slug });
  } catch (e) {
    if (errorCode(e) === "NOT_FOUND") notFound();
    throw e;
  }
  const isAdmin = user.role === "ADMIN";
  const active = event.pieces.filter((p) => !p.releasedAt);
  const past = event.pieces.filter((p) => p.releasedAt);
  const candidates = event.status === "CANCELLED" || event.archived ? [] : await api.events.assignablePieces.query({ q: find || undefined });
  const hoursByDay = new Map(event.hours.map((h) => [h.date, h]));
  const common = (
    <>
      <input type="hidden" name="id" value={event.id} />
      <input type="hidden" name="slug" value={event.slug} />
    </>
  );

  return (
    <>
      <PageHeader title={event.title} intro={eventRange(event.startsAt, event.endsAt, event.timezone)}>
        <Badge tone={event.status === "PUBLISHED" ? "good" : event.status === "CANCELLED" ? "bad" : "neutral"}>
          {event.status === "PUBLISHED" ? "Published" : event.status === "CANCELLED" ? "Cancelled" : "Draft"}
        </Badge>
        {event.archived ? <Badge tone="bad">Archived</Badge> : null}
        <Link href="/admin/events" className={buttonClass("ghost")}>
          All events
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />
      {event.status === "DRAFT" ? <Alert tone="info">This event is a draft, so visitors can't see it yet. Change its status to Published when it's ready.</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {isAdmin ? (
            <Card title="Details">
              <form action={updateEventAction}>
                {common}
                <Field label="Name of the event" htmlFor="title">
                  <Input id="title" name="title" defaultValue={event.title} required maxLength={200} />
                </Field>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label="Starts" htmlFor="startsAt">
                    <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={utcMsToLocal(new Date(event.startsAt).getTime(), event.timezone)} required />
                  </Field>
                  <Field label="Ends" htmlFor="endsAt">
                    <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={utcMsToLocal(new Date(event.endsAt).getTime(), event.timezone)} required />
                  </Field>
                </div>
                <Field label="Where in Canada is it?" htmlFor="timezone">
                  <Select id="timezone" name="timezone" defaultValue={event.timezone}>
                    {EVENT_TIME_ZONES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Venue" htmlFor="venue">
                  <Input id="venue" name="venue" defaultValue={event.venue} maxLength={200} />
                </Field>
                <Field label="Address" htmlFor="address" hint={event.mapUrl ? <a className="text-forest underline" href={event.mapUrl} target="_blank" rel="noreferrer">Check it on a map</a> : "Visitors get a map link from this."}>
                  <Input id="address" name="address" defaultValue={event.address} maxLength={400} />
                </Field>
                <Field label="Event website" htmlFor="websiteUrl">
                  <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={event.websiteUrl ?? ""} placeholder="https://" />
                </Field>
                <Field label="About the event" htmlFor="description" hint="Shown to visitors. A blank line starts a new paragraph.">
                  <Textarea id="description" name="description" defaultValue={event.description} rows={5} maxLength={5000} />
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={event.status}>
                    <option value="DRAFT">Draft (only you can see it)</option>
                    <option value="PUBLISHED">Published (visitors can see it)</option>
                    <option value="CANCELLED">Cancelled (shown as cancelled)</option>
                  </Select>
                </Field>

                <fieldset className="mb-4 rounded-lg border border-stone p-3">
                  <legend className="px-1 font-medium text-forest">Opening hours</legend>
                  <p className="mb-2 text-sm text-moss">Leave a day empty if you're closed. Save the dates first and each day appears here.</p>
                  <div className="space-y-2">
                    {event.days.map((date) => {
                      const h = hoursByDay.get(date);
                      return (
                        <div key={date} className="grid items-center gap-2 sm:grid-cols-[1fr_8rem_8rem]">
                          <input type="hidden" name="day" value={date} />
                          <span className="font-medium">{dayLabel(date)}</span>
                          <label className="sr-only" htmlFor={`open_${date}`}>
                            Opens on {dayLabel(date)}
                          </label>
                          <Input id={`open_${date}`} name={`open_${date}`} type="time" defaultValue={h?.open ?? ""} />
                          <label className="sr-only" htmlFor={`close_${date}`}>
                            Closes on {dayLabel(date)}
                          </label>
                          <Input id={`close_${date}`} name={`close_${date}`} type="time" defaultValue={h?.close ?? ""} />
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                <Field label="Private notes" htmlFor="notes" hint="Booth number, load-in time, what to bring. Only you and your staff see this.">
                  <Textarea id="notes" name="notes" defaultValue={event.notes} rows={3} maxLength={2000} />
                </Field>
                <Button type="submit">Save event</Button>
              </form>
            </Card>
          ) : (
            <Card title="Details">
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm text-moss">When</dt>
                  <dd>{eventRange(event.startsAt, event.endsAt, event.timezone)}</dd>
                </div>
                {event.venue || event.address ? (
                  <div>
                    <dt className="text-sm text-moss">Where</dt>
                    <dd>{[event.venue, event.address].filter(Boolean).join(", ")}</dd>
                  </div>
                ) : null}
                {event.notes ? (
                  <div>
                    <dt className="text-sm text-moss">Notes</dt>
                    <dd className="whitespace-pre-wrap">{event.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          )}

          <Card title={`Pieces at this event (${active.length})`}>
            {active.length === 0 ? (
              <p className="mb-3 text-moss">Nothing taken yet. Choose pieces below.</p>
            ) : (
              <ul className="mb-4 divide-y divide-stone">
                {active.map((p) => (
                  <li key={p.productId} className="flex items-center gap-3 py-2">
                    <div className="size-12 shrink-0 overflow-hidden rounded-md border border-stone bg-cream">
                      {p.thumbnailPath ? <img src={photoUrl(API_URL, p.thumbnailPath, 320)} alt="" loading="lazy" className="size-full object-cover" /> : <PhotoPlaceholder className="size-full" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/products/${p.sku}`} className="block truncate font-medium text-forest underline">
                        {p.title}
                      </Link>
                      <span className="text-sm text-moss">
                        {p.sku} · <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      </span>
                    </div>
                    {p.status === "AT_EVENT" ? (
                      <form action={unassignPieceAction}>
                        {common}
                        <input type="hidden" name="productId" value={p.productId} />
                        <Button type="submit" variant="ghost" className="min-h-10" aria-label={`Take ${p.title} off this event`}>
                          Take off
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {active.length ? (
              <Link href={`/admin/events/${event.slug}/wrap-up`} className={buttonClass("secondary")}>
                Wrap up this event
              </Link>
            ) : null}
            {past.length ? <p className="mt-3 text-sm text-moss">{past.length} {past.length === 1 ? "piece was" : "pieces were"} here earlier and {past.length === 1 ? "has" : "have"} been wrapped up.</p> : null}
          </Card>

          {event.status !== "CANCELLED" && !event.archived ? (
            <Card title="Take pieces to this event">
              <form method="GET" className="mb-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Find a piece" htmlFor="find">
                    <Input id="find" name="find" type="search" defaultValue={find ?? ""} placeholder="Title or SKU" />
                  </Field>
                </div>
                <div className="mb-4">
                  <Button type="submit" variant="secondary">
                    Search
                  </Button>
                </div>
              </form>
              {candidates.length === 0 ? (
                <p className="text-moss">{find ? "No available pieces match." : "No available pieces to take. Pieces that are available or reserved can go."}</p>
              ) : (
                <form action={assignPiecesAction}>
                  {common}
                  <ul className="mb-3 max-h-96 divide-y divide-stone overflow-y-auto rounded-lg border border-stone bg-cream">
                    {candidates.map((p) => (
                      <li key={p.id}>
                        <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                          <input type="checkbox" name="productId" value={p.id} className="size-5 accent-forest" />
                          <span className="min-w-0 flex-1 truncate">{p.title}</span>
                          <span className="shrink-0 text-sm text-moss">
                            {p.sku}
                            {p.status === "RESERVED" ? " · reserved" : ""}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button type="submit">Add ticked pieces</Button>
                </form>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {isAdmin ? (
            <Card title="Picture">
              {event.imagePath ? (
                <>
                  <img src={photoUrl(API_URL, event.imagePath, 640)} alt="" className="mb-3 w-full rounded-lg border border-stone object-cover" />
                  <form action={removeEventImageAction} className="mb-3">
                    {common}
                    <Button type="submit" variant="ghost" className="text-danger">
                      Remove picture
                    </Button>
                  </form>
                </>
              ) : (
                <p className="mb-3 text-moss">No picture yet. A banner or a photo of your booth works well.</p>
              )}
              <PhotoUploader query={`eventId=${encodeURIComponent(event.id)}`} single label={event.imagePath ? "Replace picture" : "Choose a picture"} />
            </Card>
          ) : null}

          {isAdmin ? (
            <Card title="Other things you can do">
              <div className="space-y-3">
                <form action={duplicateEventAction}>
                  {common}
                  <Button type="submit" variant="secondary" className="w-full">
                    Make a copy for next time
                  </Button>
                </form>
                <details>
                  <summary className="cursor-pointer rounded-lg px-3 py-2 text-danger">{event.archived ? "Restore this event" : "Archive this event"}</summary>
                  <form action={archiveEventAction} className="mt-1 rounded-lg border border-stone bg-cream p-2">
                    {common}
                    <input type="hidden" name="archived" value={event.archived ? "0" : "1"} />
                    <p className="mb-2 text-sm">{event.archived ? "Bring it back to your list?" : "It moves out of your way. Nothing is deleted, and you can restore it."}</p>
                    <Button type="submit" variant={event.archived ? "secondary" : "danger"} className="min-h-10">
                      {event.archived ? "Yes, restore it" : "Yes, archive it"}
                    </Button>
                  </form>
                </details>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
