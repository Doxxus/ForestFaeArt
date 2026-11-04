import { describe, expect, it } from "vitest";
import { buildIcs, eventDays, isValidTimeZone, localToUtcMs, parseHours, parseStoredHours, utcMsToLocal } from "./index";

const TZ = "America/Toronto";

describe("local time in a zone", () => {
  it("converts winter (EST, UTC-5) and summer (EDT, UTC-4) times", () => {
    expect(new Date(localToUtcMs("2026-12-05T10:00", TZ)!).toISOString()).toBe("2026-12-05T15:00:00.000Z");
    expect(new Date(localToUtcMs("2026-07-18T10:00", TZ)!).toISOString()).toBe("2026-07-18T14:00:00.000Z");
  });
  it("round-trips through utcMsToLocal", () => {
    for (const s of ["2026-12-05T10:00", "2026-07-18T23:59", "2026-01-01T00:00", "2026-11-01T12:30"]) {
      expect(utcMsToLocal(localToUtcMs(s, TZ)!, TZ)).toBe(s);
    }
  });
  it("handles the spring-forward gap by moving an hour later", () => {
    // 2026-03-08 02:30 does not exist in Toronto. Clocks jump from 02:00 to 03:00.
    expect(utcMsToLocal(localToUtcMs("2026-03-08T02:30", TZ)!, TZ)).toBe("2026-03-08T03:30");
  });
  it("handles the fall-back overlap by using the first occurrence", () => {
    // 2026-11-01 01:30 happens twice. The first is still daylight time (UTC-4).
    expect(new Date(localToUtcMs("2026-11-01T01:30", TZ)!).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("works for other zones", () => {
    expect(new Date(localToUtcMs("2026-06-01T09:00", "America/Vancouver")!).toISOString()).toBe("2026-06-01T16:00:00.000Z");
    expect(new Date(localToUtcMs("2026-06-01T09:00", "UTC")!).toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });
  it("rejects nonsense", () => {
    for (const bad of ["", "2026-02-30T10:00", "2026-12-05 10:00", "2026-12-05T25:00", "2026-12-05T10:61", "soon"]) expect(localToUtcMs(bad, TZ), bad).toBeNull();
    expect(localToUtcMs("2026-12-05T10:00", "Mars/Olympus")).toBeNull();
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("Nope/Nope")).toBe(false);
  });
});

describe("event days", () => {
  const at = (s: string) => localToUtcMs(s, TZ)!;
  it("lists every local day an event touches", () => {
    expect(eventDays(at("2026-12-05T10:00"), at("2026-12-05T17:00"), TZ)).toEqual(["2026-12-05"]);
    expect(eventDays(at("2026-12-05T10:00"), at("2026-12-07T16:00"), TZ)).toEqual(["2026-12-05", "2026-12-06", "2026-12-07"]);
  });
  it("does not count a new day when the event ends at midnight", () => {
    expect(eventDays(at("2026-12-05T10:00"), at("2026-12-06T00:00"), TZ)).toEqual(["2026-12-05"]);
  });
  it("uses the event's own zone, not UTC", () => {
    // 22:00 Toronto on the 5th is already the 6th in UTC.
    expect(eventDays(at("2026-12-05T20:00"), at("2026-12-05T23:00"), TZ)).toEqual(["2026-12-05"]);
  });
});

describe("opening hours", () => {
  it("accepts open days and closed days, sorted by date", () => {
    const r = parseHours([{ date: "2026-12-06", open: null, close: null }, { date: "2026-12-05", open: "10:00", close: "17:00" }]);
    expect(r).toEqual({ ok: true, hours: [{ date: "2026-12-05", open: "10:00", close: "17:00" }, { date: "2026-12-06", open: null, close: null }] });
  });
  it("rejects half-filled, malformed and backwards times", () => {
    expect(parseHours([{ date: "2026-12-05", open: "10:00", close: null }])).toMatchObject({ ok: false });
    expect(parseHours([{ date: "2026-12-05", open: "9am", close: "5pm" }])).toMatchObject({ ok: false });
    expect(parseHours([{ date: "2026-12-05", open: "17:00", close: "10:00" }])).toMatchObject({ ok: false });
    expect(parseHours([{ date: "tomorrow", open: null, close: null }])).toMatchObject({ ok: false });
    expect(parseHours("nope")).toMatchObject({ ok: false });
  });
  it("reads stored JSON and falls back to empty on garbage", () => {
    expect(parseStoredHours('[{"date":"2026-12-05","open":"10:00","close":"17:00"}]')).toHaveLength(1);
    expect(parseStoredHours("{oops")).toEqual([]);
    expect(parseStoredHours("[]")).toEqual([]);
  });
});

describe("iCalendar", () => {
  const ics = buildIcs(
    [
      {
        uid: "evt-1@forestfae.ca",
        title: "Winter Market, Stratford; Ontario",
        startsAt: Date.UTC(2026, 11, 5, 15, 0),
        endsAt: Date.UTC(2026, 11, 5, 22, 0),
        description: "Line one\nLine two, with a comma",
        location: "Market Hall, 1 Main St",
        url: "https://forestfae.ca/events/winter-market",
        updatedAt: Date.UTC(2026, 10, 1),
      },
      { uid: "evt-2@forestfae.ca", title: "Cancelled fair", startsAt: Date.UTC(2026, 11, 12, 15, 0), endsAt: Date.UTC(2026, 11, 12, 20, 0), cancelled: true },
    ],
    { now: Date.UTC(2026, 10, 3) },
  );
  it("is a valid calendar with CRLF line ends", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("writes UTC times and escapes special characters", () => {
    expect(ics).toContain("DTSTART:20261205T150000Z");
    expect(ics).toContain("DTEND:20261205T220000Z");
    expect(ics).toContain("SUMMARY:Winter Market\\, Stratford\\; Ontario");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\\, with a comma");
  });
  it("marks cancelled events", () => {
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("STATUS:CONFIRMED");
  });
  it("folds long lines at 75 bytes without splitting characters", () => {
    const long = buildIcs([{ uid: "x", title: "é".repeat(100), startsAt: 0, endsAt: 1000 }]);
    for (const line of long.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding gives back the original text.
    expect(long.replace(/\r\n /g, "")).toContain(`SUMMARY:${"é".repeat(100)}`);
  });
});
