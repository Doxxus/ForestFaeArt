"use server";

import { redirect } from "next/navigation";
import { EVENT_STATUSES, localToUtcMs, type DayHours, type EventStatus } from "@ffa/validators";
import { back, settle, text } from "@/lib/actions";
import { flash } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

const page = (slug: string) => `/admin/events/${slug}`;

/** Both times are typed in the event's own time zone, so they're converted here, not in the browser. */
function times(formData: FormData): { startsAt: number; endsAt: number; timezone: string } | { error: string } {
  const timezone = text(formData, "timezone") || "America/Toronto";
  const startsAt = localToUtcMs(text(formData, "startsAt"), timezone);
  const endsAt = localToUtcMs(text(formData, "endsAt"), timezone);
  if (startsAt === null) return { error: "Please choose when the event starts." };
  if (endsAt === null) return { error: "Please choose when the event ends." };
  return { startsAt, endsAt, timezone };
}

export async function createEventAction(formData: FormData) {
  await requireUser({ admin: true });
  const t = times(formData);
  if ("error" in t) redirect(`/admin/events/new?${flash("error", t.error)}`);
  const result = await settle(async () =>
    (await serverApi()).events.create.mutate({
      title: text(formData, "title"),
      venue: text(formData, "venue"),
      address: text(formData, "address"),
      ...t,
    }),
  );
  if (!result.ok) redirect(`/admin/events/new?${flash("error", result.message)}`);
  else redirect(`${page(result.value.slug)}?${flash("saved", "Event created. Add opening hours, a picture and your pieces below, then publish it when it's ready.")}`);
}

export async function updateEventAction(formData: FormData) {
  await requireUser({ admin: true });
  const slug = text(formData, "slug");
  const here = page(slug);
  const t = times(formData);
  if ("error" in t) back(here, { ok: false, message: t.error });
  const status = text(formData, "status");
  if (!EVENT_STATUSES.includes(status as EventStatus)) back(here, { ok: false, message: "Please choose a status." });

  const hours: DayHours[] = formData
    .getAll("day")
    .map(String)
    .map((date) => ({ date, open: text(formData, `open_${date}`) || null, close: text(formData, `close_${date}`) || null }));

  const result = await settle(async () =>
    (await serverApi()).events.update.mutate({
      id: text(formData, "id"),
      title: text(formData, "title"),
      description: String(formData.get("description") ?? ""),
      websiteUrl: text(formData, "websiteUrl") || null,
      venue: text(formData, "venue"),
      address: text(formData, "address"),
      notes: String(formData.get("notes") ?? ""),
      status: status as EventStatus,
      hours,
      ...(t as { startsAt: number; endsAt: number; timezone: string }),
    }),
  );
  back(here, result.ok ? { ok: true } : result, "Event saved.");
}

export async function duplicateEventAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).events.duplicate.mutate({ id: text(formData, "id") }));
  if (!result.ok) back(page(text(formData, "slug")), result);
  else redirect(`${page(result.value.slug)}?${flash("saved", "Copied. Set the new dates, then publish it when it's ready.")}`);
}

export async function archiveEventAction(formData: FormData) {
  await requireUser({ admin: true });
  const archived = text(formData, "archived") === "1";
  const result = await settle(async () => (await serverApi()).events.setArchived.mutate({ id: text(formData, "id"), archived }));
  if (!result.ok) back(page(text(formData, "slug")), result);
  else redirect(archived ? `/admin/events?${flash("saved", "Event archived.")}` : `${page(text(formData, "slug"))}?${flash("saved", "Event restored.")}`);
}

export async function removeEventImageAction(formData: FormData) {
  await requireUser({ admin: true });
  const result = await settle(async () => (await serverApi()).events.removeImage.mutate({ id: text(formData, "id") }));
  back(page(text(formData, "slug")), result.ok ? { ok: true } : result, "Picture removed.");
}

export async function assignPiecesAction(formData: FormData) {
  await requireUser();
  const slug = text(formData, "slug");
  const productIds = formData.getAll("productId").map(String);
  if (!productIds.length) back(page(slug), { ok: false, message: "Tick the pieces you're taking first." });
  const result = await settle(async () => (await serverApi()).events.assign.mutate({ eventId: text(formData, "id"), productIds }));
  if (!result.ok) back(page(slug), result);
  else {
    const { assigned, skipped } = result.value;
    const extra = skipped.length ? ` ${skipped.length} couldn't go: ${skipped.map((s) => `${s.title} (${s.reason})`).join(", ")}.` : "";
    back(page(slug), { ok: true }, `${assigned} ${assigned === 1 ? "piece" : "pieces"} added to this event.${extra}`);
  }
}

export async function unassignPieceAction(formData: FormData) {
  await requireUser();
  const result = await settle(async () =>
    (await serverApi()).events.unassign.mutate({ eventId: text(formData, "id"), productIds: [text(formData, "productId")] }),
  );
  back(page(text(formData, "slug")), result.ok ? { ok: true } : result, "Taken off the event and put back on the shelf.");
}

export async function wrapUpAction(formData: FormData) {
  await requireUser();
  const slug = text(formData, "slug");
  const result = await settle(async () => (await serverApi()).events.wrapUp.mutate({ eventId: text(formData, "id") }));
  if (!result.ok) back(page(slug), result);
  else
    redirect(
      `${page(slug)}?${flash("saved", `Wrapped up. ${result.value.returned} unsold ${result.value.returned === 1 ? "piece is" : "pieces are"} back on the shelf.`)}`,
    );
}
