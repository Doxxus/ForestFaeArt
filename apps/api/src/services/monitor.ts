import type { Env } from "../env";
import { loadSettings } from "./settings";
import { makeDb } from "../store";
import { emailProviderFor, type EmailProvider } from "../email/provider";
import { copyMissingMedia, readBackupState, runDatabaseBackup, type BackupState } from "./backup";

/**
 * A simple self-check that runs every 15 minutes (ADR 016). It looks at the database, the photo storage, the website and the
 * last backup, and emails ALERT_EMAIL when something stays broken. It can't notice if all of Cloudflare is down, so the runbook
 * also suggests a free outside monitor.
 */

export interface CheckResult {
  name: "database" | "media" | "website" | "backup";
  ok: boolean;
  detail?: string;
}

export interface MonitorState {
  /** What is failing right now, and how long. */
  failing: Record<string, { since: string; count: number; alertedAt?: string }>;
}

export interface Alert {
  subject: string;
  text: string;
}

/** Two bad checks in a row (so at least 15 minutes) before anyone is told, then a reminder once a day, then an all-clear. */
export const ALERT_AFTER_CHECKS = 2;
export const REMIND_EVERY_MS = 24 * 60 * 60_000;
/** A backup runs nightly, so one older than this means a night was missed. */
export const BACKUP_MAX_AGE_MS = 36 * 60 * 60_000;

export function evaluate(prev: MonitorState, results: CheckResult[], now: Date): { next: MonitorState; alerts: Alert[] } {
  const next: MonitorState = { failing: {} };
  const alerts: Alert[] = [];
  const bad: string[] = [];
  const reminders: string[] = [];

  for (const r of results) {
    const before = prev.failing[r.name];
    if (r.ok) {
      if (before?.alertedAt) alerts.push({ subject: `Back to normal: ${r.name}`, text: `The ${r.name} check is passing again (it had been failing since ${before.since}).` });
      continue;
    }
    const count = (before?.count ?? 0) + 1;
    const entry = { since: before?.since ?? now.toISOString(), count, alertedAt: before?.alertedAt };
    const line = `${r.name}: ${r.detail ?? "failed"} (since ${entry.since})`;
    if (!entry.alertedAt && count >= ALERT_AFTER_CHECKS) {
      entry.alertedAt = now.toISOString();
      bad.push(line);
    } else if (entry.alertedAt && now.getTime() - new Date(entry.alertedAt).getTime() >= REMIND_EVERY_MS) {
      entry.alertedAt = now.toISOString();
      reminders.push(line);
    }
    next.failing[r.name] = entry;
  }

  if (bad.length) alerts.unshift({ subject: `Problem: ${bad.map((b) => b.split(":")[0]).join(", ")}`, text: `Something needs attention:\n\n${bad.join("\n")}` });
  if (reminders.length) alerts.unshift({ subject: `Still a problem: ${reminders.map((b) => b.split(":")[0]).join(", ")}`, text: `Still failing:\n\n${reminders.join("\n")}` });
  return { next, alerts };
}

async function timed<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** The same questions /health asks, as separate results. */
export async function storageChecks(env: Pick<Env, "DB" | "MEDIA">): Promise<CheckResult[]> {
  const [database, media] = await Promise.all([
    env.DB.prepare("SELECT 1").first().then(() => true, () => false),
    env.MEDIA.head("health-check").then(() => true, () => false),
  ]);
  return [
    { name: "database", ok: database, detail: database ? undefined : "The database did not answer." },
    { name: "media", ok: media, detail: media ? undefined : "The photo storage did not answer." },
  ];
}

export async function websiteCheck(env: Pick<Env, "WEB_ORIGIN">, fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<CheckResult> {
  if (!/^https:\/\//.test(env.WEB_ORIGIN)) return { name: "website", ok: true, detail: "skipped" };
  try {
    const res = await timed(8_000, (signal) => fetcher(`${env.WEB_ORIGIN}/healthz`, { signal, headers: { "user-agent": "ffa-monitor" } }));
    return res.status === 200 ? { name: "website", ok: true } : { name: "website", ok: false, detail: `The website answered ${res.status}.` };
  } catch {
    return { name: "website", ok: false, detail: "The website did not answer." };
  }
}

export function backupCheck(state: BackupState | null, now: Date): CheckResult {
  if (!state) return { name: "backup", ok: false, detail: "No backup has been made yet." };
  if (!state.ok) return { name: "backup", ok: false, detail: `The last backup failed: ${state.error ?? "unknown reason"}` };
  const age = now.getTime() - new Date(state.at).getTime();
  return age > BACKUP_MAX_AGE_MS ? { name: "backup", ok: false, detail: `The last backup was ${Math.round(age / 3_600_000)} hours ago.` } : { name: "backup", ok: true };
}

const STATE_KEY = "state/monitor.json";

/** One monitor run. Never throws, so a bad run can't stop the next one. */
export async function runMonitor(
  env: Env,
  now: Date = new Date(),
  fetcher?: typeof fetch,
  email: EmailProvider | null = emailProviderFor(env),
): Promise<{ results: CheckResult[]; alerts: Alert[]; media: { copied: number; remaining: number } | null }> {
  const results = [...(await storageChecks(env)), await websiteCheck(env, fetcher)];
  let media: { copied: number; remaining: number } | null = null;
  if (env.BACKUPS) {
    // A brand-new environment gets its first backup straight away, rather than waiting for the night run.
    let state = await readBackupState(env.BACKUPS).catch(() => null);
    if (!state) state = await runDatabaseBackup(env, now);
    results.push(backupCheck(state, now));
    // Catch the photo backup up a few files at a time (see copyMissingMedia).
    media = await copyMissingMedia(env, 10).catch((error) => {
      console.error(JSON.stringify({ event: "media-backup-failed", message: String(error) }));
      return null;
    });
  }

  let alerts: Alert[] = [];
  if (env.BACKUPS) {
    const previous = await env.BACKUPS.get(STATE_KEY).then((o) => (o ? (o.json() as Promise<MonitorState>) : { failing: {} }), () => ({ failing: {} }) as MonitorState);
    const outcome = evaluate(previous, results, now);
    alerts = outcome.alerts;
    await env.BACKUPS.put(STATE_KEY, JSON.stringify(outcome.next), { httpMetadata: { contentType: "application/json" } }).catch(() => undefined);
  }

  const failing = results.filter((r) => !r.ok);
  if (failing.length) console.error(JSON.stringify({ event: "monitor-check-failed", environment: env.ENVIRONMENT, failing }));

  if (alerts.length && env.ALERT_EMAIL) {
    if (email) {
      const from = await loadSettings(makeDb(env.DB)).then((s) => s.systemFromEmail, () => "Forest Fae Folk Art <noreply@forestfae.ca>");
      for (const alert of alerts) {
        const sent = await email.send({
          from,
          to: [env.ALERT_EMAIL],
          subject: `[${env.ENVIRONMENT}] ${alert.subject}`,
          text: `${alert.text}\n\nSee the runbook, "When something is wrong".`,
          html: `<p>${alert.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p><p>See the runbook, "When something is wrong".</p>`,
        });
        if (!sent.ok) console.error(JSON.stringify({ event: "monitor-alert-email-failed", error: sent.error }));
      }
    } else {
      console.error(JSON.stringify({ event: "monitor-alert-not-sent", reason: "no email provider", alerts: alerts.map((a) => a.subject) }));
    }
  }
  return { results, alerts, media };
}
