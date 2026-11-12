import { z } from "zod";
import { PAYMENT_METHODS, STORE_MODES } from "./enums";
import { emptySetupProgress, setupProgressSchema } from "./setup";

const emailish = z.string().trim().max(254).refine((v) => v === "" || z.string().email().safeParse(v).success, {
  message: "Enter a valid email address",
});
const urlish = z.string().trim().max(500).refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
  message: "Enter a full web address starting with https://",
});
const text = (max: number) => z.string().trim().max(max);

interface SettingDef<T extends z.ZodType> {
  schema: T;
  default: z.infer<T>;
  /** Safe to expose to the public website. Everything else needs a signed-in user. */
  public: boolean;
}

const def = <T extends z.ZodType>(d: SettingDef<T>) => d;

/** The typed, validated set of site settings (not free-form keys). Values are stored as JSON text. */
export const SETTINGS = {
  storeMode: def({ schema: z.enum(STORE_MODES), default: "SHOWCASE_ONLY", public: true }),
  siteLive: def({ schema: z.boolean(), default: false, public: true }),
  showPrices: def({ schema: z.boolean(), default: true, public: true }),
  showProductsWithoutPhotos: def({ schema: z.boolean(), default: false, public: true }),
  showStockCounts: def({ schema: z.boolean(), default: false, public: true }),
  showEtsyLinks: def({ schema: z.boolean(), default: true, public: true }),
  businessName: def({ schema: text(120), default: "Forest Fae Folk Art", public: true }),
  tagline: def({ schema: text(200), default: "Handmade insect art", public: true }),
  sourcingStatement: def({
    schema: text(2000),
    default: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. (Draft: please write your own sourcing statement.)",
    public: true,
  }),
  instagramUrl: def({ schema: urlish, default: "https://www.instagram.com/forestfaefolkart", public: true }),
  etsyUrl: def({ schema: urlish, default: "https://forestfaefolkart.etsy.com", public: true }),
  facebookUrl: def({ schema: urlish, default: "", public: true }),
  /** Shown on the contact page when it is filled in. */
  businessPhone: def({ schema: text(40), default: "", public: true }),
  /** Sample pieces and events are always hidden from the public site unless the owner turns this on (SAMP-3). */
  showSampleData: def({ schema: z.boolean(), default: false, public: false }),
  /** How far the Setup Wizard has got (SET-1). Kept so it can be left and resumed. */
  setupProgress: def({ schema: setupProgressSchema, default: emptySetupProgress(), public: false }),
  /** Shown on the contact page and in the footer. Separate from the private inbox that inquiries arrive at. */
  publicEmail: def({ schema: emailish, default: "asa@forestfae.ca", public: true }),
  inquiryEmail: def({ schema: emailish, default: "asa@forestfae.ca", public: false }),
  systemFromEmail: def({ schema: emailish, default: "noreply@forestfae.ca", public: false }),
  replyToEmail: def({ schema: emailish, default: "asa@forestfae.ca", public: false }),
  qrBaseUrl: def({ schema: urlish, default: "https://forestfae.ca", public: false }),
  defaultLabelTemplateId: def({ schema: z.string().max(40).nullable(), default: null, public: false }),
  taxRegistered: def({ schema: z.boolean(), default: false, public: false }),
  /** Which payment methods the POS offers (POS-4). The app only records the method. */
  paymentMethods: def({ schema: z.array(z.enum(PAYMENT_METHODS)).min(1), default: [...PAYMENT_METHODS], public: false }),
  taxRegistrationNumber: def({ schema: text(40), default: "", public: false }),
  smallSupplierThresholdCents: def({ schema: z.number().int().positive(), default: 3_000_000, public: false }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;
export type Settings = { [K in SettingKey]: SettingValue<K> };

/** Placeholder copy is lorem ipsum, which the owner is meant to replace (WEB-2). */
export const isPlaceholderText = (s: string) => /lorem ipsum/i.test(s);

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const PUBLIC_SETTING_KEYS = SETTING_KEYS.filter((k) => SETTINGS[k].public);

export const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(SETTINGS, key);

export function defaultSettings(): Settings {
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTINGS[k].default])) as Settings;
}

/** Combine stored JSON strings with defaults. Unknown keys and values that no longer validate fall back to the default. */
export function resolveSettings(stored: Record<string, string>): Settings {
  const out = defaultSettings() as Record<string, unknown>;
  for (const key of SETTING_KEYS) {
    const raw = stored[key];
    if (raw === undefined) continue;
    try {
      const parsed = SETTINGS[key].schema.safeParse(JSON.parse(raw));
      if (parsed.success) out[key] = parsed.data;
    } catch {
      // Corrupt JSON: keep the default.
    }
  }
  return out as Settings;
}

/** Validate a single value for writing. Throws a ZodError with a friendly message. */
export function parseSettingValue<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return SETTINGS[key].schema.parse(value) as SettingValue<K>;
}
