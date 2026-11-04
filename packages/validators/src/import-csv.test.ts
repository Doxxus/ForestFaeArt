import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE_CSV, buildFixCsv, parseCsv, parseImport, parseMoney, parseYesNo, toCsv, type ImportContext } from "./index";

const f = (key: string, label: string, type: "TEXT" | "SELECT" | "MULTI_SELECT" | "YEAR", options: string[] = []) => ({
  key,
  label,
  type,
  options: JSON.stringify(options),
});

const ctx: ImportContext = {
  categoryNames: ["Butterfly", "Moth", "Jewelry", "Collection"],
  now: new Date("2026-11-03T00:00:00Z"),
  fields: [
    f("species", "Species", "TEXT"),
    f("insect_type", "Insect Type", "SELECT", ["Butterfly", "Moth", "Beetle"]),
    f("collection", "Collection", "SELECT", []),
    f("frame_color", "Frame Color", "SELECT", ["Black", "Walnut"]),
    f("frame_size", "Frame Size", "TEXT"),
    f("creation_year", "Creation Year", "YEAR"),
    f("tags", "Tags", "MULTI_SELECT", []),
    f("provenance", "Provenance / Sourcing", "SELECT", ["Ethically sourced", "Farm-raised"]),
    f("provenance_note", "Provenance note", "TEXT"),
  ],
};

const TEMPLATE = IMPORT_TEMPLATE_CSV;

describe("CSV reading", () => {
  it("handles quotes, embedded commas and line breaks, CRLF, a BOM and blank trailing lines", () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","line1\nline2"\r\n2,"say ""hi""",\r\n');
    expect(rows.map((r) => r.cells)).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", "line1\nline2"],
      ["2", 'say "hi"', ""],
    ]);
    expect(rows.map((r) => r.line)).toEqual([1, 2, 4]);
  });
  it("round-trips through toCsv", () => {
    const rows = [["a", 'b "q"', "c,d", "e\nf"]];
    expect(parseCsv(toCsv(rows)).map((r) => r.cells)).toEqual(rows);
  });
});

describe("value parsers", () => {
  it("parses money to cents and rejects bad amounts", () => {
    expect(parseMoney("45")).toBe(4500);
    expect(parseMoney("45.5")).toBe(4550);
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("0")).toBe(0);
    for (const bad of ["abc", "-5", "1.234", "45.", "", "1,23", "$", "1e3"]) expect(parseMoney(bad), bad).toBeNull();
  });
  it("parses yes/no words", () => {
    for (const y of ["yes", "Y", "TRUE", "1"]) expect(parseYesNo(y)).toBe(true);
    for (const n of ["no", "N", "false", "0"]) expect(parseYesNo(n)).toBe(false);
    expect(parseYesNo("maybe")).toBeNull();
  });
});

describe("the shipped template", () => {
  const parsed = parseImport(TEMPLATE, ctx);
  it("imports cleanly", () => {
    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.rows.map((r) => r.errors)).toEqual([[], []]);
  });
  it("reads every field of the first row", () => {
    const r = parsed.rows[0]!;
    expect(r.line).toBe(2);
    expect(r.externalId).toBe("1");
    expect(r.product).toMatchObject({
      title: "Blue Morpho Shadowbox",
      priceCents: 12000,
      quantity: 1,
      status: "AVAILABLE",
      featured: true,
      portfolioVisible: false,
      hidePrice: false,
      costCents: 4500,
      etsyUrl: "https://www.etsy.com/ca/listing/0000000000/blue-morpho-shadowbox",
      notes: "Display piece from spring batch",
    });
    expect(r.product!.description).toBe("Iridescent blue morpho in a handmade wooden shadowbox.\n\nMounted on moss with dried botanicals.");
    expect(r.categories).toEqual(["Butterfly", "Collection"]);
    expect(r.metadata).toEqual({
      species: "Morpho menelaus",
      insect_type: "Butterfly",
      collection: "Forest Collection",
      frame_color: "Walnut",
      frame_size: "8x10 in",
      creation_year: 2025,
      tags: ["blue", "iridescent"],
      provenance: "Ethically sourced",
      provenance_note: "Farm-raised and ethically sourced",
    });
  });
  it("flags choices that don't exist yet so they can be created with confirmation", () => {
    expect(parsed.rows[0]!.newOptions).toEqual([
      { fieldKey: "collection", option: "Forest Collection" },
      { fieldKey: "tags", option: "blue" },
      { fieldKey: "tags", option: "iridescent" },
    ]);
    expect(parsed.rows[1]!.newOptions).toEqual([{ fieldKey: "tags", option: "pendant" }, { fieldKey: "tags", option: "green" }]);
  });
  it("defaults the second row", () => {
    expect(parsed.rows[1]!.product).toMatchObject({ priceCents: 3500, quantity: 3, featured: false, etsyUrl: null, costCents: 1200, weightGrams: null });
  });
});

describe("headers", () => {
  it("matches headers ignoring case, spaces, underscores and hyphens, in any order", () => {
    const p = parseImport("Price,TITLE,Frame-Color,insect type,Provenance / Sourcing\n10,Moth,black,moth,farm-raised\n", ctx);
    expect(p.rows[0]!.errors).toEqual([]);
    expect(p.rows[0]!.metadata).toEqual({ frame_color: "Black", insect_type: "Moth", provenance: "Farm-raised" });
  });
  it("lists unknown columns and ignores them", () => {
    const p = parseImport("title,price,shoe size,Colour\nA,1,9,red\n", ctx);
    expect(p.unknownColumns).toEqual(["shoe size", "Colour"]);
    expect(p.rows[0]!.errors).toEqual([]);
  });
  it("requires title and price columns", () => {
    expect(parseImport("title,qty\nA,1\n", ctx).fileErrors).toEqual(['The file needs a "price" column.']);
    expect(parseImport("", ctx).fileErrors).toEqual(["The file is empty."]);
  });
  it("refuses files with too many rows", () => {
    const big = "title,price\n" + Array.from({ length: 1001 }, (_, i) => `T${i},1`).join("\n");
    expect(parseImport(big, ctx).fileErrors[0]).toMatch(/at most 1000/);
  });
  it("skips blank rows and keeps real line numbers", () => {
    const p = parseImport("title,price\nA,1\n,\n\nB,2\n", ctx);
    expect(p.rows.map((r) => [r.line, r.product?.title])).toEqual([[2, "A"], [5, "B"]]);
  });
});

describe("row validation", () => {
  const one = (header: string, row: string) => parseImport(`${header}\n${row}\n`, ctx).rows[0]!;
  it("requires a title and a price, and checks their format", () => {
    expect(one("title,price", ",5").errors).toContain("A title is required.");
    expect(one("title,price", "A,").errors).toContain("A price is required.");
    expect(one("title,price", "A,abc").errors[0]).toMatch(/isn't a valid price/);
    expect(one("title,price", "A,-5").errors[0]).toMatch(/isn't a valid price/);
    expect(one("title,price", `${"x".repeat(121)},5`).errors[0]).toMatch(/120/);
    expect(one("title,price", "A,5").product).not.toBeNull();
  });
  it("returns no product for a row with errors", () => {
    expect(one("title,price,quantity", "A,5,many").product).toBeNull();
  });
  it("checks quantity, yes/no cells and the status word", () => {
    expect(one("title,price,quantity", "A,5,-1").errors[0]).toMatch(/quantity/);
    expect(one("title,price,quantity", "A,5,2.5").errors[0]).toMatch(/quantity/);
    expect(one("title,price,featured", "A,5,maybe").errors[0]).toMatch(/yes or no/);
    expect(one("title,price,status", "A,5,at event").errors[0]).toMatch(/can't be imported/);
    expect(one("title,price,status", "A,5,pending_payment").errors[0]).toMatch(/can't be imported/);
    expect(one("title,price,status", "A,5,archived").errors[0]).toMatch(/can't be imported/);
    expect(one("title,price,status", "A,5,lost").errors[0]).toMatch(/isn't recognised/);
    expect(one("title,price,status", "A,5,RESERVED").product?.status).toBe("RESERVED");
  });
  it("reconciles sold and quantity, with a warning", () => {
    const sold = one("title,price,quantity,status", "A,5,2,sold");
    expect(sold.product).toMatchObject({ status: "SOLD", quantity: 0 });
    expect(sold.warnings[0]).toMatch(/sold out/);
    const empty = one("title,price,quantity,status", "A,5,0,available");
    expect(empty.product).toMatchObject({ status: "SOLD", quantity: 0 });
    expect(empty.warnings[0]).toMatch(/imported as sold/);
    const reserved0 = one("title,price,quantity,status", "A,5,0,reserved");
    expect(reserved0.product?.status).toBe("SOLD");
    expect(one("title,price,quantity,status", "A,5,0,draft").product).toMatchObject({ status: "DRAFT", quantity: 0 });
    expect(one("title,price,status", "A,5,sold").warnings).toEqual([]);
  });
  it("only keeps reserved_for and sold_date where they apply", () => {
    const r = one("title,price,status,reserved_for,sold_date", "A,5,available,Sam,2026-03-01");
    expect(r.product).toMatchObject({ reservedNote: null, soldDate: null });
    expect(r.warnings).toHaveLength(2);
    expect(one("title,price,status,reserved_for", "A,5,reserved,Sam").product?.reservedNote).toBe("Sam");
    expect(one("title,price,status,sold_date", "A,5,sold,2026-03-01").product?.soldDate).toBe("2026-03-01");
    expect(one("title,price,status,sold_date", "A,5,sold,2026-02-30").errors[0]).toMatch(/sold_date/);
    expect(one("title,price,status,sold_date", "A,5,sold,03/01/2026").errors[0]).toMatch(/sold_date/);
  });
  it("checks Etsy links, costs and measurements, converting cm to mm", () => {
    expect(one("title,price,etsy_url", "A,5,http://etsy.com/x").errors[0]).toMatch(/https/);
    expect(one("title,price,etsy_url", "A,5,https://etsy.com/x").product?.etsyUrl).toBe("https://etsy.com/x");
    expect(one("title,price,cost", "A,5,free").errors[0]).toMatch(/cost/);
    const m = one("title,price,weight_g,length_cm,width_cm,height_cm", "A,5,120,25.4,20,3.55");
    expect(m.product).toMatchObject({ weightGrams: 120, lengthMm: 254, widthMm: 200, heightMm: 36 });
    expect(one("title,price,length_cm", "A,5,-3").errors[0]).toMatch(/length_cm/);
  });
  it("matches categories ignoring case and spacing, and flags unknown ones", () => {
    const r = one("title,price,categories", 'A,5," moth ;  BUTTERFLY; Framed ; framed;;"');
    expect(r.categories).toEqual(["Moth", "Butterfly"]);
    expect(r.newCategories).toEqual(["Framed"]);
  });
  it("validates metadata values, including the year range", () => {
    expect(one("title,price,creation_year", "A,5,2027").errors[0]).toMatch(/1900 to 2026/);
    expect(one("title,price,creation_year", "A,5,1850").errors[0]).toMatch(/1900/);
    expect(one("title,price,creation_year", "A,5,2020").metadata).toEqual({ creation_year: 2020 });
    const unknownChoice = one("title,price,insect_type", "A,5,Dragonfly");
    expect(unknownChoice.errors).toEqual([]);
    expect(unknownChoice.newOptions).toEqual([{ fieldKey: "insect_type", option: "Dragonfly" }]);
  });
  it("rejects a row with more cells than headers", () => {
    expect(one("title,price", "A,5,extra").errors[0]).toMatch(/more columns/);
  });
  it("catches a repeated external_id within the file", () => {
    const p = parseImport("external_id,title,price\nx,A,1\ny,B,2\nx,C,3\n", ctx);
    expect(p.rows.map((r) => r.errors.length)).toEqual([0, 0, 1]);
    expect(p.rows[2]!.errors[0]).toMatch(/already used on line 2/);
  });
});

describe("fix-it file", () => {
  it("contains only the failing rows, with the original columns and an error column", () => {
    const p = parseImport("title,price,notes\nGood,5,ok\nBad,abc,\"has, comma\"\n,9,x\n", ctx);
    const out = parseCsv(buildFixCsv(p)).map((r) => r.cells);
    expect(out[0]).toEqual(["title", "price", "notes", "error"]);
    expect(out).toHaveLength(3);
    expect(out[1]!.slice(0, 3)).toEqual(["Bad", "abc", "has, comma"]);
    expect(out[1]![3]).toMatch(/valid price/);
    expect(out[2]![3]).toMatch(/title/);
  });
});
