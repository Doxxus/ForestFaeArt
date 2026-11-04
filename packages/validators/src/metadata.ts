import type { MetadataFieldType } from "./enums";

export interface MetadataFieldDef {
  key: string;
  label: string;
  type: MetadataFieldType;
  /** JSON array of allowed choices (SELECT, MULTI_SELECT). */
  options: string;
}

export type MetadataValueResult = { ok: true; value: string | null } | { ok: false; message: string };

export function parseOptions(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

const MAX_TEXT = 500;
const bad = (label: string, why: string): MetadataValueResult => ({ ok: false, message: `${label}: ${why}` });

/**
 * Checks one value against its field and returns the text to store, or null to clear it.
 * SELECT choices are matched ignoring case and stored with the field's own spelling.
 */
export function validateMetadataValue(field: MetadataFieldDef, input: unknown): MetadataValueResult {
  const { label } = field;
  if (input === null || input === undefined || input === "" || (Array.isArray(input) && input.length === 0)) {
    return { ok: true, value: null };
  }
  const options = parseOptions(field.options);
  const pick = (v: unknown) => (typeof v === "string" ? options.find((o) => o.toLowerCase() === v.trim().toLowerCase()) : undefined);

  switch (field.type) {
    case "TEXT": {
      if (typeof input !== "string") return bad(label, "enter some text");
      const text = input.trim();
      if (text.length > MAX_TEXT) return bad(label, `keep it under ${MAX_TEXT} characters`);
      return { ok: true, value: text || null };
    }
    case "NUMBER": {
      const n = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
      if (!Number.isFinite(n)) return bad(label, "enter a number");
      return { ok: true, value: String(n) };
    }
    case "YEAR": {
      const n = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
      if (!Number.isInteger(n) || n < 1000 || n > 2200) return bad(label, "enter a four-digit year");
      return { ok: true, value: String(n) };
    }
    case "YES_NO": {
      if (typeof input === "boolean") return { ok: true, value: String(input) };
      if (input === "true" || input === "false") return { ok: true, value: input };
      return bad(label, "choose yes or no");
    }
    case "SELECT": {
      const choice = pick(input);
      return choice ? { ok: true, value: choice } : bad(label, "choose one of the listed options");
    }
    case "MULTI_SELECT": {
      if (!Array.isArray(input)) return bad(label, "choose from the listed options");
      const picked: string[] = [];
      for (const item of input) {
        const choice = pick(item);
        if (!choice) return bad(label, `"${String(item)}" is not one of the listed options`);
        if (!picked.includes(choice)) picked.push(choice);
      }
      return { ok: true, value: JSON.stringify(picked) };
    }
  }
}

/** The stored text turned back into a value for the admin form and the API. */
export function decodeMetadataValue(type: MetadataFieldType, stored: string): string | number | boolean | string[] {
  switch (type) {
    case "NUMBER":
    case "YEAR":
      return Number(stored);
    case "YES_NO":
      return stored === "true";
    case "MULTI_SELECT":
      return parseOptions(stored);
    default:
      return stored;
  }
}

/** Stable key for a new field from its label, for example "Frame Color" to "frame_color". */
export function metadataKeyFromLabel(label: string): string {
  const key = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return key || "field";
}

const SKU_LIKE = /^ffa-\d{6}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A slug must be URL-safe and must not look like a SKU, because the QR code resolver tries the SKU first. */
export function checkSlug(slug: string): string | null {
  if (slug.length < 1 || slug.length > 80 || !SLUG.test(slug)) return "Use lower-case letters, numbers and single hyphens only.";
  if (SKU_LIKE.test(slug)) return "That looks like a SKU. Please choose a different web address.";
  return null;
}
