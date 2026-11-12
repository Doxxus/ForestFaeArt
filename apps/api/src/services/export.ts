import { asc, desc, events, inquiries, products } from "@ffa/db";
import { csvCell, toCsv } from "@ffa/validators";
import type { Env } from "../env";
import type { Db } from "../store";
import { customersCsv } from "./customers";
import { readBackupState, type BackupState } from "./backup";
import { salesCsv } from "./sales";

export interface ExportFile {
  name: string;
  /** Plain text. */
  content: string;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const yesNo = (b: boolean) => (b ? "Yes" : "No");

const README = `Your Forest Fae Folk Art data
=============================

These files hold everything the website and app know about the business, as plain spreadsheets (CSV).
Open them in Excel, Numbers or Google Sheets.

  inventory.csv    every piece: its number, title, price, what it cost, how many, and its status
  sales.csv        every sale, including ones that were undone
  customers.csv    people who bought something (not anyone who asked to be forgotten)
  events.csv       markets and shows
  inquiries.csv    messages from the contact form

This is a copy for your records. It does not include photos, and it can't be used to restore the website:
that is what the automatic nightly backups are for (the runbook explains them).
`;

/** Everything the owner might want to keep, as spreadsheets (the "Export my data" requirement). Cost is included: the owner is the administrator. */
export async function exportBundle(db: Db): Promise<ExportFile[]> {
  const [pieces, eventRows, inquiryRows] = await Promise.all([
    db.select().from(products).orderBy(asc(products.sku)).all(),
    db.select().from(events).orderBy(desc(events.startsAt)).all(),
    db.select().from(inquiries).orderBy(desc(inquiries.createdAt)).all(),
  ]);
  const inventory = toCsv([
    ["SKU", "Title", "Status", "Quantity", "Price", "Cost", "Currency", "Description", "Listed on Etsy", "Shown on the website", "Sample", "Added", "Archived"],
    ...pieces.map((p) => [p.sku, csvCell(p.title), p.status, String(p.quantity), dollars(p.priceCents), dollars(p.costCents), p.currency, csvCell(p.description), yesNo(p.listedOnEtsy), yesNo(p.portfolioVisible), yesNo(p.isSample), day(p.createdAt), day(p.archivedAt)]),
  ]);
  const eventsCsv = toCsv([
    ["Title", "Status", "Starts", "Ends", "Venue", "Address", "Website", "Notes"],
    ...eventRows.map((e) => [csvCell(e.title), e.status, e.startsAt.toISOString(), e.endsAt.toISOString(), csvCell(e.venue), csvCell(e.address), csvCell(e.websiteUrl ?? ""), csvCell(e.notes)]),
  ]);
  const inquiriesCsv = toCsv([
    ["Received", "Name", "Email", "Status", "Message"],
    ...inquiryRows.map((i) => [i.createdAt.toISOString(), csvCell(i.name), csvCell(i.email), i.status, csvCell(i.message)]),
  ]);
  return [
    { name: "README.txt", content: README },
    { name: "inventory.csv", content: inventory },
    { name: "sales.csv", content: await salesCsv(db, {}) },
    { name: "customers.csv", content: await customersCsv(db) },
    { name: "events.csv", content: eventsCsv },
    { name: "inquiries.csv", content: inquiriesCsv },
  ];
}

export interface BackupSummary {
  /** False when no backup bucket is connected (local development). */
  configured: boolean;
  database: BackupState | null;
  /** How many backup files are kept. */
  kept: number;
  photos: number;
}

/** What the owner sees under "Your data": when the last backup ran and whether it worked. Never any file contents. */
export async function backupSummary(env: Pick<Env, "BACKUPS">): Promise<BackupSummary> {
  if (!env.BACKUPS) return { configured: false, database: null, kept: 0, photos: 0 };
  const [database, dbFiles, photoFiles] = await Promise.all([
    readBackupState(env.BACKUPS).catch(() => null),
    env.BACKUPS.list({ prefix: "db/", limit: 1000 }),
    env.BACKUPS.list({ prefix: "media/", limit: 1000 }),
  ]);
  return { configured: true, database, kept: dbFiles.objects.length, photos: photoFiles.objects.length + (photoFiles.truncated ? 1 : 0) };
}
