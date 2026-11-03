import { describe, expect, it } from "vitest";
import {
  PRODUCT_STATUSES,
  PUBLIC_SETTING_KEYS,
  SETTINGS,
  STATUS_TRANSITIONS,
  checkTransition,
  defaultSettings,
  parseSettingValue,
  resolveSettings,
  slugify,
  statusAfterStockChange,
  uniqueSlug,
} from "./index";

describe("slugs", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Luna Moth, 8x10 Frame!")).toBe("luna-moth-8x10-frame");
    expect(slugify("Café Scarabée")).toBe("cafe-scarabee");
    expect(slugify("Fae's Wing")).toBe("faes-wing");
    expect(slugify("  --  ")).toBe("item");
    expect(slugify("日本語")).toBe("item");
  });
  it("caps the length without a trailing hyphen", () => {
    const s = slugify("word ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
  it("finds the first free slug", async () => {
    const taken = new Set(["moth", "moth-2"]);
    expect(await uniqueSlug("moth", async (s) => taken.has(s))).toBe("moth-3");
    expect(await uniqueSlug("beetle", async (s) => taken.has(s))).toBe("beetle");
  });
});

describe("status transitions", () => {
  it("lists every status and only references known statuses", () => {
    expect(Object.keys(STATUS_TRANSITIONS).sort()).toEqual([...PRODUCT_STATUSES].sort());
    for (const targets of Object.values(STATUS_TRANSITIONS)) {
      for (const to of Object.keys(targets)) expect(PRODUCT_STATUSES).toContain(to);
    }
  });

  it("allows ordinary moves for STAFF", () => {
    expect(checkTransition({ from: "AVAILABLE", to: "RESERVED", role: "STAFF" }).ok).toBe(true);
    expect(checkTransition({ from: "AT_EVENT", to: "SOLD", role: "STAFF" }).ok).toBe(true);
  });

  it("rejects same-status and unlisted moves", () => {
    for (const s of PRODUCT_STATUSES) {
      expect(checkTransition({ from: s, to: s, role: "ADMIN" }).ok).toBe(false);
    }
    expect(checkTransition({ from: "DRAFT", to: "SOLD", role: "ADMIN" })).toMatchObject({ ok: false, code: "INVALID" });
    expect(checkTransition({ from: "ARCHIVED", to: "SOLD", role: "ADMIN" })).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("reopening a SOLD item needs ADMIN and a reason", () => {
    const base = { from: "SOLD", to: "AVAILABLE", reason: "Buyer returned it" } as const;
    expect(checkTransition({ ...base, role: "STAFF" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition({ ...base, role: "ADMIN", reason: "  " })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(checkTransition({ ...base, role: "ADMIN" }).ok).toBe(true);
  });

  it("archiving and restoring are ADMIN only", () => {
    for (const from of ["DRAFT", "AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT", "SOLD"] as const) {
      expect(checkTransition({ from, to: "ARCHIVED", role: "STAFF" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(checkTransition({ from, to: "ARCHIVED", role: "ADMIN" }).ok).toBe(true);
    }
    expect(checkTransition({ from: "ARCHIVED", to: "DRAFT", role: "STAFF" }).ok).toBe(false);
    expect(checkTransition({ from: "ARCHIVED", to: "DRAFT", role: "ADMIN" }).ok).toBe(true);
  });
});

describe("stock changes", () => {
  it("reaching zero marks a stocked product SOLD", () => {
    for (const s of ["AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"] as const) {
      expect(statusAfterStockChange(s, 0)).toBe("SOLD");
    }
  });
  it("keeps the status while stock remains", () => {
    expect(statusAfterStockChange("AT_EVENT", 2)).toBe("AT_EVENT");
    expect(statusAfterStockChange("AVAILABLE", 1)).toBe("AVAILABLE");
  });
  it("restocking a SOLD product makes it AVAILABLE", () => {
    expect(statusAfterStockChange("SOLD", 3)).toBe("AVAILABLE");
  });
  it("never changes DRAFT or ARCHIVED", () => {
    for (const s of ["DRAFT", "ARCHIVED"] as const) {
      expect(statusAfterStockChange(s, 0)).toBe(s);
      expect(statusAfterStockChange(s, 5)).toBe(s);
    }
  });
  it("rejects negative or fractional quantities", () => {
    expect(() => statusAfterStockChange("AVAILABLE", -1)).toThrow();
    expect(() => statusAfterStockChange("AVAILABLE", 1.5)).toThrow();
  });
});

describe("settings", () => {
  it("defaults validate against their own schemas", () => {
    for (const [key, d] of Object.entries(SETTINGS)) {
      expect(d.schema.safeParse(d.default).success, key).toBe(true);
    }
  });
  it("keeps the secret-ish and business settings out of the public set", () => {
    expect(PUBLIC_SETTING_KEYS).toContain("storeMode");
    for (const k of ["inquiryEmail", "systemFromEmail", "replyToEmail", "qrBaseUrl", "taxRegistered"]) {
      expect(PUBLIC_SETTING_KEYS).not.toContain(k);
    }
  });
  it("is showcase-only, prices on, site not live, tax off by default", () => {
    expect(defaultSettings()).toMatchObject({ storeMode: "SHOWCASE_ONLY", showPrices: true, siteLive: false, taxRegistered: false });
  });
  it("resolves stored values and falls back on bad or unknown ones", () => {
    const s = resolveSettings({
      storeMode: JSON.stringify("EVENT_ONLY"),
      showPrices: "not json",
      siteLive: JSON.stringify("yes"),
      bogus: JSON.stringify(1),
    });
    expect(s.storeMode).toBe("EVENT_ONLY");
    expect(s.showPrices).toBe(true);
    expect(s.siteLive).toBe(false);
    expect("bogus" in s).toBe(false);
  });
  it("validates writes", () => {
    expect(parseSettingValue("storeMode", "ONLINE_STORE")).toBe("ONLINE_STORE");
    expect(() => parseSettingValue("storeMode", "OPEN")).toThrow();
    expect(() => parseSettingValue("qrBaseUrl", "javascript:alert(1)")).toThrow();
    expect(parseSettingValue("inquiryEmail", "")).toBe("");
    expect(() => parseSettingValue("inquiryEmail", "nope")).toThrow();
  });
});
