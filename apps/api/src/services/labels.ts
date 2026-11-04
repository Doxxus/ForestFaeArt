import { and, asc, eq, inArray, labelPrints, labelTemplates, products, sql } from "@ffa/db";
import {
  LABEL_LIMITS,
  LABEL_PRESETS,
  isTestLabelContext,
  labelTemplateBodySchema,
  newId,
  type LabelSource,
  type LabelState,
  type LabelTemplateBody,
  type LabelPrinterKind,
} from "@ffa/validators";
import type { Env } from "../env";
import { auditStatement } from "./audit";
import { loadSettings } from "./settings";
import type { Db } from "../store";

export type LabelServiceError = { ok: false; code: "NOT_FOUND" | "CONFLICT" | "INVALID"; message: string };
const fail = (code: LabelServiceError["code"], message: string): LabelServiceError => ({ ok: false, code, message });

// ---------------------------------------------------------------------------
// Context: where labels point and whether they are tests (LBL-13)
// ---------------------------------------------------------------------------

export interface LabelContext {
  baseUrl: string;
  isTest: boolean;
  environment: Env["ENVIRONMENT"];
}

export async function loadLabelContext(db: Db, env: Pick<Env, "ENVIRONMENT">): Promise<LabelContext> {
  const settings = await loadSettings(db);
  return { baseUrl: settings.qrBaseUrl, isTest: isTestLabelContext(env.ENVIRONMENT, settings.qrBaseUrl), environment: env.ENVIRONMENT };
}

// ---------------------------------------------------------------------------
// Templates (LBL-2)
// ---------------------------------------------------------------------------

export interface LabelTemplateDto extends LabelTemplateBody {
  id: string;
  orientation: "LANDSCAPE" | "PORTRAIT";
  isDefault: boolean;
  active: boolean;
}

type TemplateRow = typeof labelTemplates.$inferSelect;

const parseJson = (text: string): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const fallback = LABEL_PRESETS[0]!.body;

/** Rows always come back as a valid template, even if someone edited the JSON by hand: bad parts fall back to the default. */
export function toTemplateDto(row: TemplateRow): LabelTemplateDto {
  const fields = parseJson(row.fields);
  const margins = parseJson(row.marginsMm);
  const candidate = {
    name: row.name,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    marginMm: typeof margins.all === "number" ? margins.all : fallback.marginMm,
    logoAreaRatio: typeof fields.logoAreaRatio === "number" ? fields.logoAreaRatio : fallback.logoAreaRatio,
    uppercaseUrl: typeof fields.uppercaseUrl === "boolean" ? fields.uppercaseUrl : fallback.uppercaseUrl,
    show: { ...fallback.show, ...(fields.show && typeof fields.show === "object" ? (fields.show as object) : {}) },
    align: fields.align === "center" ? "center" : "left",
    textScale: typeof fields.textScale === "number" ? fields.textScale : fallback.textScale,
  };
  const parsed = labelTemplateBodySchema.safeParse(candidate);
  const body = parsed.success ? parsed.data : { ...fallback, name: row.name, widthMm: row.widthMm, heightMm: row.heightMm };
  return { id: row.id, ...body, orientation: row.orientation, isDefault: row.isDefault, active: row.active };
}

const rowValues = (body: LabelTemplateBody) => ({
  name: body.name,
  widthMm: body.widthMm,
  heightMm: body.heightMm,
  orientation: (body.widthMm >= body.heightMm ? "LANDSCAPE" : "PORTRAIT") as "LANDSCAPE" | "PORTRAIT",
  marginsMm: JSON.stringify({ all: body.marginMm }),
  fields: JSON.stringify({ show: body.show, logoAreaRatio: body.logoAreaRatio, uppercaseUrl: body.uppercaseUrl, align: body.align, textScale: body.textScale }),
  updatedAt: new Date(),
});

/** The shipped presets are added the first time templates are asked for. Deleting one later never brings it back. */
async function ensureTemplates(db: Db): Promise<void> {
  const count = await db.select({ n: sql<number>`COUNT(*)` }).from(labelTemplates).get();
  if ((count?.n ?? 0) > 0) return;
  await db.batch(
    LABEL_PRESETS.map((p, i) => db.insert(labelTemplates).values({ id: `tpl_${p.key}`, ...rowValues(p.body), isDefault: i === 0, active: true }).onConflictDoNothing()) as unknown as Parameters<Db["batch"]>[0],
  );
}

export async function listTemplates(db: Db, opts: { includeInactive?: boolean } = {}): Promise<LabelTemplateDto[]> {
  await ensureTemplates(db);
  const rows = await db.select().from(labelTemplates).orderBy(asc(labelTemplates.createdAt), sql`label_template.rowid`).all();
  return rows.map(toTemplateDto).filter((t) => opts.includeInactive || t.active);
}

export async function createTemplate(db: Db, actorId: string, body: LabelTemplateBody): Promise<{ ok: true; id: string } | LabelServiceError> {
  await ensureTemplates(db);
  const id = newId();
  await db.batch([
    db.insert(labelTemplates).values({ id, ...rowValues(body), isDefault: false, active: true }),
    auditStatement(db, { userId: actorId, action: "label.template.create", entityType: "label_template", entityId: id, diff: { name: body.name } }),
  ]);
  return { ok: true, id };
}

export async function updateTemplate(db: Db, actorId: string, id: string, body: LabelTemplateBody): Promise<{ ok: true } | LabelServiceError> {
  const row = await db.select().from(labelTemplates).where(eq(labelTemplates.id, id)).get();
  if (!row) return fail("NOT_FOUND", "That label template doesn't exist.");
  await db.batch([
    db.update(labelTemplates).set(rowValues(body)).where(eq(labelTemplates.id, id)),
    auditStatement(db, { userId: actorId, action: "label.template.update", entityType: "label_template", entityId: id, diff: { name: body.name } }),
  ]);
  return { ok: true };
}

export async function duplicateTemplate(db: Db, actorId: string, id: string): Promise<{ ok: true; id: string } | LabelServiceError> {
  const row = await db.select().from(labelTemplates).where(eq(labelTemplates.id, id)).get();
  if (!row) return fail("NOT_FOUND", "That label template doesn't exist.");
  const dto = toTemplateDto(row);
  return createTemplate(db, actorId, { ...dto, name: `${dto.name} copy`.slice(0, 60) });
}

/** The default is swapped in one batch, so there is never a moment with two or none (the unique index would refuse two). */
export async function setDefaultTemplate(db: Db, actorId: string, id: string): Promise<{ ok: true } | LabelServiceError> {
  const row = await db.select().from(labelTemplates).where(eq(labelTemplates.id, id)).get();
  if (!row) return fail("NOT_FOUND", "That label template doesn't exist.");
  if (!row.active) return fail("INVALID", "Restore this template before making it the default.");
  await db.batch([
    db.update(labelTemplates).set({ isDefault: false, updatedAt: new Date() }).where(eq(labelTemplates.isDefault, true)),
    db.update(labelTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(labelTemplates.id, id)),
    auditStatement(db, { userId: actorId, action: "label.template.default", entityType: "label_template", entityId: id }),
  ]);
  return { ok: true };
}

/** Archived rather than deleted, because past print records point at the template. The default cannot be archived. */
export async function setTemplateActive(db: Db, actorId: string, id: string, active: boolean): Promise<{ ok: true } | LabelServiceError> {
  const row = await db.select().from(labelTemplates).where(eq(labelTemplates.id, id)).get();
  if (!row) return fail("NOT_FOUND", "That label template doesn't exist.");
  if (!active && row.isDefault) return fail("CONFLICT", "Choose a different default template first.");
  await db.batch([
    db.update(labelTemplates).set({ active, updatedAt: new Date() }).where(eq(labelTemplates.id, id)),
    auditStatement(db, { userId: actorId, action: active ? "label.template.restore" : "label.template.archive", entityType: "label_template", entityId: id }),
  ]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Which label is on each piece (LBL-12)
// ---------------------------------------------------------------------------

/**
 * SQL for how a piece's label stands, comparing the newest print of the matching kind (test or real) with the piece today.
 * Test prints only count while labels are being made as tests, so staging prints never make a real piece look labelled.
 */
export const labelStateSql = (isTest: boolean) => {
  const flag = isTest ? 1 : 0;
  return sql<LabelState>`(CASE
    WHEN NOT EXISTS (SELECT 1 FROM label_print a WHERE a.product_id = product.id AND a.is_test = ${flag}) THEN 'NONE'
    WHEN EXISTS (
      SELECT 1 FROM label_print l
      WHERE l.id = (SELECT l2.id FROM label_print l2 WHERE l2.product_id = product.id AND l2.is_test = ${flag} ORDER BY l2.at DESC, l2.id DESC LIMIT 1)
        AND (l.title_snapshot != product.title OR l.price_cents_snapshot != product.price_cents)
    ) THEN 'STALE'
    ELSE 'CURRENT' END)`;
};

/** Pieces that can sensibly have a label made: not archived, and not sold unless asked for by id. */
const LABELLABLE = ["DRAFT", "AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"] as const;

export interface LabelItem {
  productId: string;
  sku: string;
  title: string;
  priceCents: number;
  status: string;
  state: LabelState;
  /** Copies the last real or test print made. 0 when never printed. */
  lastCopies: number;
}

export type PrepareSource =
  | { source: Extract<LabelSource, "ids">; productIds: string[] }
  | { source: Extract<LabelSource, "category">; categoryId: string }
  | { source: Extract<LabelSource, "event">; eventId: string }
  | { source: Extract<LabelSource, "unlabelled" | "stale"> };

/** Everything needed to draw labels for a selection, read fresh so a title or price edit is never printed stale. */
export async function prepareLabels(db: Db, ctx: LabelContext, selection: PrepareSource): Promise<{ ok: true; items: LabelItem[]; truncated: boolean } | LabelServiceError> {
  const state = labelStateSql(ctx.isTest);
  const lastCopies = sql<number>`COALESCE((SELECT l3.copies FROM label_print l3 WHERE l3.product_id = product.id AND l3.is_test = ${ctx.isTest ? 1 : 0} ORDER BY l3.at DESC, l3.id DESC LIMIT 1), 0)`;
  const cap = LABEL_LIMITS.maxProductsPerPrint;

  let where;
  switch (selection.source) {
    case "ids": {
      const ids = [...new Set(selection.productIds)];
      if (!ids.length) return fail("INVALID", "Choose at least one piece.");
      where = and(inArray(products.id, ids), sql`product.status != 'ARCHIVED'`);
      break;
    }
    case "category":
      where = and(
        inArray(products.status, [...LABELLABLE]),
        sql`EXISTS (SELECT 1 FROM product_category pc WHERE pc.product_id = product.id AND pc.category_id = ${selection.categoryId})`,
      );
      break;
    case "event":
      where = and(sql`EXISTS (SELECT 1 FROM event_product ep WHERE ep.product_id = product.id AND ep.event_id = ${selection.eventId} AND ep.released_at IS NULL)`, sql`product.status != 'ARCHIVED'`);
      break;
    case "unlabelled":
      where = and(inArray(products.status, [...LABELLABLE]), sql`${state} = 'NONE'`);
      break;
    case "stale":
      where = and(inArray(products.status, [...LABELLABLE]), sql`${state} = 'STALE'`);
      break;
  }

  const rows = await db
    .select({ productId: products.id, sku: products.sku, title: products.title, priceCents: products.priceCents, status: products.status, state, lastCopies })
    .from(products)
    .where(where)
    .orderBy(asc(products.sku))
    .limit(cap + 1)
    .all();
  const truncated = rows.length > cap;
  const items = rows.slice(0, cap);
  if (selection.source === "ids" && !items.length) return fail("NOT_FOUND", "Those pieces weren't found.");
  return { ok: true, items, truncated };
}

// ---------------------------------------------------------------------------
// Print records (LBL-4, LBL-12, LBL-13)
// ---------------------------------------------------------------------------

export interface RecordPrintItem {
  productId: string;
  copies: number;
  /** What was drawn on the label, so a later change can be spotted. */
  title: string;
  priceCents: number;
}

export interface RecordPrintInput {
  items: RecordPrintItem[];
  templateId: string | null;
  format: string;
  printer: LabelPrinterKind;
}

export async function recordPrints(
  db: Db,
  ctx: LabelContext,
  actorId: string,
  input: RecordPrintInput,
): Promise<{ ok: true; recorded: number; labels: number; isTest: boolean } | LabelServiceError> {
  if (!input.items.length) return fail("INVALID", "There is nothing to record.");
  const ids = [...new Set(input.items.map((i) => i.productId))];
  if (ids.length !== input.items.length) return fail("INVALID", "Each piece can appear once in a print.");
  const labels = input.items.reduce((sum, i) => sum + i.copies, 0);
  if (labels > LABEL_LIMITS.maxLabelsPerPrint) return fail("INVALID", `Please print at most ${LABEL_LIMITS.maxLabelsPerPrint} labels at a time.`);
  const found = await db.select({ id: products.id, sku: products.sku }).from(products).where(inArray(products.id, ids)).all();
  if (found.length !== ids.length) return fail("NOT_FOUND", "One of those pieces doesn't exist.");
  if (input.templateId) {
    const template = await db.select({ id: labelTemplates.id }).from(labelTemplates).where(eq(labelTemplates.id, input.templateId)).get();
    if (!template) return fail("NOT_FOUND", "That label template doesn't exist.");
  }
  const skuOf = new Map(found.map((f) => [f.id, f.sku]));
  const at = new Date();
  await db.batch([
    ...input.items.map((item) =>
      db.insert(labelPrints).values({
        id: newId(),
        productId: item.productId,
        userId: actorId,
        templateId: input.templateId,
        format: input.format,
        printer: input.printer,
        titleSnapshot: item.title,
        priceCentsSnapshot: item.priceCents,
        qrUrl: `${ctx.baseUrl.replace(/\/+$/, "")}/p/${skuOf.get(item.productId)}`,
        isTest: ctx.isTest,
        copies: item.copies,
        at,
      }),
    ),
    auditStatement(db, {
      userId: actorId,
      action: ctx.isTest ? "label.print.test" : "label.print",
      entityType: "label_print",
      diff: { pieces: input.items.length, labels, printer: input.printer, format: input.format },
    }),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return { ok: true, recorded: input.items.length, labels, isTest: ctx.isTest };
}

export interface PrintHistoryRow {
  id: string;
  at: number;
  copies: number;
  printer: string;
  format: string;
  isTest: boolean;
  title: string;
  priceCents: number;
  templateName: string | null;
}

export async function printHistory(db: Db, productId: string, limit = 10): Promise<PrintHistoryRow[]> {
  const rows = await db
    .select({
      id: labelPrints.id,
      at: labelPrints.at,
      copies: labelPrints.copies,
      printer: labelPrints.printer,
      format: labelPrints.format,
      isTest: labelPrints.isTest,
      title: labelPrints.titleSnapshot,
      priceCents: labelPrints.priceCentsSnapshot,
      templateName: labelTemplates.name,
    })
    .from(labelPrints)
    .leftJoin(labelTemplates, eq(labelTemplates.id, labelPrints.templateId))
    .where(eq(labelPrints.productId, productId))
    .orderBy(sql`${labelPrints.at} DESC`, sql`${labelPrints.id} DESC`)
    .limit(limit)
    .all();
  return rows.map((r) => ({ ...r, at: r.at.getTime() }));
}

/** Counts for the dashboard and the products list. */
export async function labelCounts(db: Db, ctx: LabelContext): Promise<{ unlabelled: number; stale: number }> {
  const state = labelStateSql(ctx.isTest);
  const row = await db
    .select({
      unlabelled: sql<number>`COALESCE(SUM(CASE WHEN ${state} = 'NONE' THEN 1 ELSE 0 END), 0)`,
      stale: sql<number>`COALESCE(SUM(CASE WHEN ${state} = 'STALE' THEN 1 ELSE 0 END), 0)`,
    })
    .from(products)
    .where(inArray(products.status, [...LABELLABLE]))
    .get();
  return { unlabelled: row?.unlabelled ?? 0, stale: row?.stale ?? 0 };
}
