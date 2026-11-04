import { sql } from "@ffa/db";
import { isPlaceholderText } from "@ffa/validators";
import { listCategories } from "./catalogue";
import { listContent } from "./content";
import { labelCounts, type LabelContext } from "./labels";
import { loadSettings } from "./settings";
import type { Db } from "../store";

export interface Attention {
  siteLive: boolean;
  /** Pages still holding placeholder copy or marked as draft. */
  draftPages: { key: string; title: string }[];
  sourcingPlaceholder: boolean;
  /** Categories (not hidden) whose description is still placeholder text. */
  placeholderCategories: number;
  contactMissing: boolean;
  /** Pieces that would show on the website once it is published. */
  publicPieces: number;
  piecesNeedingPhotos: number;
  photosMissingAlt: number;
  reservedPieces: number;
  draftPieces: number;
  etsySoldToRemove: number;
  /** Pieces that have never had a label printed (counted for test or real labels, per the environment). */
  unlabelledPieces: number;
  /** Pieces whose title or price changed after their label was printed (LBL-12). */
  staleLabels: number;
  newInquiries: number;
  failedEmails: number;
  /** No email provider is set up yet, so messages wait instead of being sent. */
  emailNotSetUp: boolean;
  /** Messages and replies waiting for email to be set up. */
  waitingEmails: number;
}

const n = (rows: { n: number }[]) => rows[0]?.n ?? 0;

/** Everything that needs the owner's eye, for the dashboard and the "Publish my website" checklist (WEB-18). */
export async function loadAttention(db: Db, opts: { emailConfigured: boolean; labels: LabelContext }): Promise<Attention> {
  const [settings, pages, categories, labels] = await Promise.all([loadSettings(db), listContent(db), listCategories(db), labelCounts(db, opts.labels)]);
  const count = (query: ReturnType<typeof sql>) => db.all<{ n: number }>(query).then(n);
  const [publicPieces, needPhotos, missingAlt, reserved, drafts, etsy, newInquiries, failedEmails, waiting] = await Promise.all([
    count(sql`SELECT COUNT(*) AS n FROM product p WHERE p.status IN ('AVAILABLE','AT_EVENT','PENDING_PAYMENT','RESERVED','SOLD') AND p.portfolio_visible = 1
      AND (${settings.showProductsWithoutPhotos ? 1 : 0} = 1 OR EXISTS (SELECT 1 FROM product_image pi WHERE pi.product_id = p.id))`),
    count(sql`SELECT COUNT(*) AS n FROM product p WHERE p.status != 'ARCHIVED' AND NOT EXISTS (SELECT 1 FROM product_image pi WHERE pi.product_id = p.id)`),
    count(sql`SELECT COUNT(*) AS n FROM product_image pi JOIN product p ON p.id = pi.product_id WHERE p.status != 'ARCHIVED' AND trim(pi.alt_text) = ''`),
    count(sql`SELECT COUNT(*) AS n FROM product WHERE status = 'RESERVED'`),
    count(sql`SELECT COUNT(*) AS n FROM product WHERE status = 'DRAFT'`),
    count(sql`SELECT COUNT(*) AS n FROM product WHERE listed_on_etsy = 1 AND status = 'SOLD'`),
    count(sql`SELECT COUNT(*) AS n FROM inquiry WHERE status = 'NEW'`),
    count(sql`SELECT (SELECT COUNT(*) FROM inquiry WHERE email_delivery_status = 'FAILED') + (SELECT COUNT(*) FROM inquiry_reply WHERE delivery_status = 'FAILED') AS n`),
    count(sql`SELECT (SELECT COUNT(*) FROM inquiry WHERE email_delivery_status = 'PENDING') + (SELECT COUNT(*) FROM inquiry_reply WHERE delivery_status = 'PENDING') AS n`),
  ]);
  return {
    siteLive: settings.siteLive,
    draftPages: pages.filter((p) => p.isDraft || p.placeholder).map((p) => ({ key: p.key, title: p.title })),
    sourcingPlaceholder: isPlaceholderText(settings.sourcingStatement) || settings.sourcingStatement.trim() === "",
    placeholderCategories: categories.filter((c) => !c.hidden && isPlaceholderText(c.description)).length,
    contactMissing: settings.inquiryEmail.trim() === "",
    publicPieces,
    piecesNeedingPhotos: needPhotos,
    photosMissingAlt: missingAlt,
    reservedPieces: reserved,
    draftPieces: drafts,
    etsySoldToRemove: etsy,
    unlabelledPieces: labels.unlabelled,
    staleLabels: labels.stale,
    newInquiries,
    failedEmails,
    emailNotSetUp: !opts.emailConfigured,
    waitingEmails: waiting,
  };
}
