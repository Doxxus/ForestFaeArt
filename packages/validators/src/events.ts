// Event dates and calendar files. Pure functions: no database.
// Events store UTC milliseconds plus a time zone name, and forms work in the event's local time.

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Local date and time parts of an instant in a time zone. */
function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** How far ahead of UTC the zone's clock is at that instant, in milliseconds. */
function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2026-12-05T10:00" as typed in a form for a zone, to a UTC instant. Returns null for text that isn't a real date.
 * Handles daylight saving: a time that doesn't exist (spring forward) moves an hour later, and an ambiguous time (fall back) uses the first.
 */
export function localToUtcMs(local: string, timeZone: string): number | null {
  const m = LOCAL.exec(local);
  if (!m || !isValidTimeZone(timeZone)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const first = asUtc - offsetAt(asUtc, timeZone);
  const second = asUtc - offsetAt(first, timeZone);
  // If the corrected instant doesn't read back as the typed time, the typed time falls in a spring-forward gap.
  // The first estimate then lands an hour later, which is where clocks actually go.
  return utcMsToLocal(second, timeZone) === local ? second : first;
}

/** A UTC instant as "2026-12-05T10:00" in a zone, for filling in a form. */
export function utcMsToLocal(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Each calendar day an event touches in its own zone, as "YYYY-MM-DD". */
export function eventDays(startMs: number, endMs: number, timeZone: string): string[] {
  const first = utcMsToLocal(startMs, timeZone).slice(0, 10);
  // An event that ends exactly at midnight does not include the new day.
  const last = utcMsToLocal(Math.max(startMs, endMs - 1), timeZone).slice(0, 10);
  const days: string[] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  const stop = new Date(`${last}T00:00:00Z`);
  while (cursor <= stop && days.length < 60) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export interface DayHours {
  date: string;
  /** "10:00", or null when closed that day. */
  open: string | null;
  close: string | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks the opening hours the form sends and returns them in date order, or a message. */
export function parseHours(input: unknown): { ok: true; hours: DayHours[] } | { ok: false; message: string } {
  if (!Array.isArray(input)) return { ok: false, message: "Opening hours are not in the right format." };
  const out: DayHours[] = [];
  for (const raw of input) {
    const r = raw as Partial<DayHours> | null;
    if (!r || typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return { ok: false, message: "Each day needs a date." };
    const open = r.open ?? null;
    const close = r.close ?? null;
    if ((open === null) !== (close === null)) return { ok: false, message: `${r.date}: give both an opening and a closing time, or leave both empty.` };
    if (open !== null && close !== null) {
      if (!TIME.test(open) || !TIME.test(close)) return { ok: false, message: `${r.date}: times should look like 10:00.` };
      if (close <= open) return { ok: false, message: `${r.date}: closing time must be after opening time.` };
    }
    out.push({ date: r.date, open, close });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, hours: out };
}

export function parseStoredHours(json: string): DayHours[] {
  try {
    const parsed = parseHours(JSON.parse(json));
    return parsed.ok ? parsed.hours : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545)
// ---------------------------------------------------------------------------

export interface IcsEvent {
  uid: string;
  title: string;
  startsAt: number;
  endsAt: number;
  description?: string;
  location?: string;
  url?: string;
  cancelled?: boolean;
  updatedAt?: number;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Lines longer than 75 bytes are folded onto continuation lines that start with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], opts: { productId?: string; now?: number } = {}): string {
  const now = opts.now ?? Date.now();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${opts.productId ?? "-//Forest Fae Folk Art//Events//EN"}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsStamp(e.updatedAt ?? now)}`,
      `DTSTART:${icsStamp(e.startsAt)}`,
      `DTEND:${icsStamp(e.endsAt)}`,
      `SUMMARY:${icsText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
