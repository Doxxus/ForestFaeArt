import { validateMetadataValue, parseOptions, type MetadataFieldDef } from "./metadata";

// A pure CSV importer (requirements Appendix A). It reads and checks a file against the current categories and
// metadata fields and reports problems per row. It never touches the database.

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// CSV reading and writing (RFC 4180)
// ---------------------------------------------------------------------------

export interface CsvRow {
  cells: string[];
  /** Line in the file where the row starts (the header is line 1). */
  line: number;
}

export function parseCsv(input: string): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    rows.push({ cells, line: rowLine });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && cell === "") {
      quoted = true;
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += c;
    }
  }
  if (cell !== "" || cells.length) endRow();
  return rows;
}

const needsQuotes = /[",\r\n]/;
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => (needsQuotes.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[\s_-]+/g, "");

/** CAD with no more than 2 decimals, an optional $ and thousands commas. Returns cents or null. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/^\$\s*/, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.replaceAll(",", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 10_000_000 ? cents : null;
}

export function parseYesNo(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

// ---------------------------------------------------------------------------
// Parsing a whole import file
// ---------------------------------------------------------------------------

export type ImportStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "DRAFT";
const STATUS_WORDS: Record<string, ImportStatus> = { available: "AVAILABLE", reserved: "RESERVED", sold: "SOLD", draft: "DRAFT" };
const NOT_IMPORTABLE = new Set(["at_event", "atevent", "pending_payment", "pendingpayment", "archived"]);

const STANDARD_COLUMNS = [
  "external_id", "title", "price", "description", "quantity", "status", "categories", "featured", "show_on_website",
  "hide_price", "etsy_url", "cost", "reserved_for", "sold_date", "notes", "weight_g", "length_cm", "width_cm", "height_cm",
] as const;
const STANDARD = new Map<string, string>(STANDARD_COLUMNS.map((c) => [normalizeHeader(c), c]));

export interface ImportContext {
  /** Names of categories that are not archived. */
  categoryNames: string[];
  /** Metadata fields that are not archived. */
  fields: MetadataFieldDef[];
  /** For the year range check. */
  now?: Date;
}

export interface ImportProduct {
  title: string;
  priceCents: number;
  description: string;
  quantity: number;
  status: ImportStatus;
  featured: boolean;
  portfolioVisible: boolean;
  hidePrice: boolean;
  etsyUrl: string | null;
  costCents: number | null;
  reservedNote: string | null;
  /** Kept in the history note, since no sale record is created. */
  soldDate: string | null;
  notes: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

export interface ParsedRow {
  line: number;
  cells: string[];
  externalId: string | null;
  product: ImportProduct | null;
  /** Existing categories to link, spelled as they are in the database. */
  categories: string[];
  newCategories: string[];
  /** Metadata values by field key, ready for validation and saving. */
  metadata: Record<string, string | number | boolean | string[]>;
  /** Choices that do not exist yet and would be added if the owner agrees. */
  newOptions: { fieldKey: string; option: string }[];
  errors: string[];
  warnings: string[];
}

export interface ParsedImport {
  headers: string[];
  unknownColumns: string[];
  fileErrors: string[];
  rows: ParsedRow[];
}

const fileFailure = (headers: string[], message: string): ParsedImport => ({ headers, unknownColumns: [], fileErrors: [message], rows: [] });

export function parseImport(text: string, ctx: ImportContext): ParsedImport {
  if (text.length > IMPORT_MAX_BYTES) return fileFailure([], "That file is larger than 5 MB.");
  const csv = parseCsv(text);
  if (!csv.length) return fileFailure([], "The file is empty.");
  const headerRow = csv[0]!;
  const headers = headerRow.cells.map((h) => h.trim());
  const data = csv.slice(1).filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (data.length > IMPORT_MAX_ROWS) return fileFailure(headers, `Please import at most ${IMPORT_MAX_ROWS} rows at a time.`);

  const fieldByHeader = new Map<string, MetadataFieldDef>();
  for (const f of ctx.fields) {
    fieldByHeader.set(normalizeHeader(f.key), f);
    fieldByHeader.set(normalizeHeader(f.label), f);
  }

  // Which column index holds what. A repeated header is ignored after its first use.
  const standardAt = new Map<string, number>();
  const metadataAt = new Map<MetadataFieldDef, number>();
  const unknownColumns: string[] = [];
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    const std = STANDARD.get(key);
    const field = fieldByHeader.get(key);
    if (std && !standardAt.has(std)) standardAt.set(std, i);
    else if (!std && field && !metadataAt.has(field)) metadataAt.set(field, i);
    else if (h !== "") unknownColumns.push(h);
  });

  const fileErrors: string[] = [];
  for (const required of ["title", "price"]) if (!standardAt.has(required)) fileErrors.push(`The file needs a "${required}" column.`);
  if (fileErrors.length) return { headers, unknownColumns, fileErrors, rows: [] };

  const categoryByName = new Map(ctx.categoryNames.map((n) => [n.trim().toLowerCase(), n]));
  const year = (ctx.now ?? new Date()).getUTCFullYear();
  const seenExternal = new Map<string, number>();

  const rows = data.map((csvRow): ParsedRow => {
    const cells = csvRow.cells;
    const get = (col: string) => (cells[standardAt.get(col) ?? -1] ?? "").trim();
    const row: ParsedRow = { line: csvRow.line, cells, externalId: null, product: null, categories: [], newCategories: [], metadata: {}, newOptions: [], errors: [], warnings: [] };
    const err = (m: string) => row.errors.push(m);
    const warn = (m: string) => row.warnings.push(m);
    if (cells.length > headers.length) err("This row has more columns than the header row.");

    const externalId = get("external_id");
    if (externalId) {
      row.externalId = externalId;
      const first = seenExternal.get(externalId);
      if (first !== undefined) err(`external_id "${externalId}" is already used on line ${first}.`);
      else seenExternal.set(externalId, csvRow.line);
    }

    const title = get("title");
    if (!title) err("A title is required.");
    else if (title.length > 120) err("The title must be 120 characters or fewer.");

    const priceRaw = get("price");
    const priceCents = priceRaw === "" ? null : parseMoney(priceRaw);
    if (priceRaw === "") err("A price is required.");
    else if (priceCents === null) err(`"${priceRaw}" isn't a valid price. Use a number like 45 or 45.00.`);

    const description = (cells[standardAt.get("description") ?? -1] ?? "").trim();
    if (description.length > 5000) err("The description must be 5,000 characters or fewer.");

    const bool = (col: string, fallback: boolean) => {
      const raw = get(col);
      if (raw === "") return fallback;
      const v = parseYesNo(raw);
      if (v === null) err(`${col}: "${raw}" should be yes or no.`);
      return v ?? fallback;
    };
    const featured = bool("featured", false);
    const portfolioVisible = bool("show_on_website", false);
    const hidePrice = bool("hide_price", false);

    const qtyRaw = get("quantity");
    let quantity = 1;
    if (qtyRaw !== "") {
      if (/^\d+$/.test(qtyRaw) && Number(qtyRaw) <= 100_000) quantity = Number(qtyRaw);
      else err(`quantity: "${qtyRaw}" should be a whole number, 0 or more.`);
    }

    const statusRaw = get("status");
    let status: ImportStatus = "AVAILABLE";
    if (statusRaw !== "") {
      const word = statusRaw.toLowerCase();
      if (STATUS_WORDS[word]) status = STATUS_WORDS[word]!;
      else if (NOT_IMPORTABLE.has(word.replace(/\s+/g, "_"))) err(`status: "${statusRaw}" can't be imported. Use available, reserved, sold or draft.`);
      else err(`status: "${statusRaw}" isn't recognised. Use available, reserved, sold or draft.`);
    }
    // The database keeps "sold" and "no stock" in step (INV-12), so reconcile the two and say so.
    if (status === "SOLD" && quantity > 0 && qtyRaw !== "") warn("This row is sold but has a quantity above 0. It is imported as sold out.");
    if (status === "SOLD") quantity = 0;
    else if (quantity === 0 && (status === "AVAILABLE" || status === "RESERVED")) {
      warn("Quantity is 0, so this item is imported as sold.");
      status = "SOLD";
    }

    const etsyRaw = get("etsy_url");
    let etsyUrl: string | null = null;
    if (etsyRaw) {
      if (/^https:\/\/\S+$/i.test(etsyRaw) && etsyRaw.length <= 500) etsyUrl = etsyRaw;
      else err("etsy_url should be a full web address starting with https://");
    }

    const costRaw = get("cost");
    const costCents = costRaw === "" ? null : parseMoney(costRaw);
    if (costRaw !== "" && costCents === null) err(`cost: "${costRaw}" isn't a valid amount.`);

    let reservedNote: string | null = get("reserved_for") || null;
    if (reservedNote && status !== "RESERVED") {
      warn("reserved_for is only used when the status is reserved, so it was ignored.");
      reservedNote = null;
    }
    let soldDate: string | null = get("sold_date") || null;
    if (soldDate) {
      if (!validDate(soldDate)) {
        err(`sold_date: "${soldDate}" should look like 2026-03-31.`);
        soldDate = null;
      } else if (status !== "SOLD") {
        warn("sold_date is only used when the status is sold, so it was ignored.");
        soldDate = null;
      }
    }

    const measure = (col: string, scale: number): number | null => {
      const raw = get(col);
      if (raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100_000) {
        err(`${col}: "${raw}" should be a number, 0 or more.`);
        return null;
      }
      return Math.round(n * scale);
    };
    const weightGrams = measure("weight_g", 1);
    const lengthMm = measure("length_cm", 10);
    const widthMm = measure("width_cm", 10);
    const heightMm = measure("height_cm", 10);

    for (const name of get("categories").split(";").map((n) => n.trim()).filter(Boolean)) {
      const known = categoryByName.get(name.toLowerCase());
      const target = known ?? name;
      if (known) {
        if (!row.categories.includes(known)) row.categories.push(known);
      } else if (!row.newCategories.some((c) => c.toLowerCase() === name.toLowerCase())) {
        row.newCategories.push(target);
      }
    }

    for (const [field, index] of metadataAt) {
      const raw = (cells[index] ?? "").trim();
      if (raw === "") continue;
      const asList = field.type === "MULTI_SELECT";
      const input: string | string[] = asList ? raw.split(";").map((s) => s.trim()).filter(Boolean) : raw;
      const options = parseOptions(field.options);
      const isChoice = field.type === "SELECT" || field.type === "MULTI_SELECT";
      let working = field;
      if (isChoice) {
        // Unknown choices are collected so they can be added with the owner's say-so (IMP-4).
        const missing = (Array.isArray(input) ? input : [input]).filter((v) => !options.some((o) => o.toLowerCase() === v.toLowerCase()));
        const unique = missing.filter((v, i) => missing.findIndex((m) => m.toLowerCase() === v.toLowerCase()) === i);
        for (const option of unique) row.newOptions.push({ fieldKey: field.key, option });
        working = { ...field, options: JSON.stringify([...options, ...unique]) };
      }
      if (field.type === "YEAR") {
        const y = Number(raw);
        if (!Number.isInteger(y) || y < 1900 || y > year) {
          err(`${field.label}: "${raw}" should be a year from 1900 to ${year}.`);
          continue;
        }
      }
      const checked = validateMetadataValue(working, input);
      if (!checked.ok) err(checked.message);
      else if (checked.value !== null) {
        row.metadata[field.key] = field.type === "MULTI_SELECT" ? (JSON.parse(checked.value) as string[]) : field.type === "NUMBER" || field.type === "YEAR" ? Number(checked.value) : field.type === "YES_NO" ? checked.value === "true" : checked.value;
      }
    }

    if (!row.errors.length && priceCents !== null) {
      row.product = {
        title, priceCents, description, quantity, status, featured, portfolioVisible, hidePrice, etsyUrl, costCents,
        reservedNote, soldDate, notes: get("notes"), weightGrams, lengthMm, widthMm, heightMm,
      };
    }
    return row;
  });

  return { headers, unknownColumns, fileErrors, rows };
}

/** The rows with errors, with the original columns and an extra "error" column, for the owner to fix and re-import. */
export function buildFixCsv(parsed: ParsedImport): string {
  const bad = parsed.rows.filter((r) => r.errors.length);
  return toCsv([[...parsed.headers, "error"], ...bad.map((r) => [...parsed.headers.map((_, i) => r.cells[i] ?? ""), r.errors.join(" ")])]);
}
