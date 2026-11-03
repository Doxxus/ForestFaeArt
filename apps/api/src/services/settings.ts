import { settings as settingsTable } from "@ffa/db";
import {
  PUBLIC_SETTING_KEYS,
  isSettingKey,
  parseSettingValue,
  resolveSettings,
  type SettingKey,
  type Settings,
} from "@ffa/validators";
import { auditStatement } from "./audit";
import type { Db } from "../store";

/** Every setting, with defaults filled in for anything not yet saved. */
export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(settingsTable).all();
  return resolveSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

export type PublicSettings = Pick<Settings, (typeof PUBLIC_SETTING_KEYS)[number]>;

/** Only the settings that are safe for the public site. Business emails, QR base URL and tax settings are never included. */
export function toPublicSettings(settings: Settings): PublicSettings {
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, settings[k]])) as PublicSettings;
}

export type SaveSettingsResult = { ok: true; changed: SettingKey[] } | { ok: false; message: string };

/** Validates and saves changed settings (ADMIN only, enforced by the caller) and audits what changed. */
export async function saveSettings(
  db: Db,
  userId: string,
  patch: Record<string, unknown>,
): Promise<SaveSettingsResult> {
  const current = await loadSettings(db);
  const changes: [SettingKey, unknown][] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!isSettingKey(key)) return { ok: false, message: `Unknown setting: ${key}` };
    let parsed: unknown;
    try {
      parsed = parseSettingValue(key, value);
    } catch (error) {
      const issue = (error as { issues?: { message: string }[] }).issues?.[0]?.message;
      return { ok: false, message: `${key}: ${issue ?? "invalid value"}` };
    }
    if (JSON.stringify(parsed) !== JSON.stringify(current[key])) changes.push([key, parsed]);
  }
  if (!changes.length) return { ok: true, changed: [] };

  await db.batch([
    ...changes.map(([key, value]) =>
      db
        .insert(settingsTable)
        .values({ key, value: JSON.stringify(value), updatedBy: userId })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: JSON.stringify(value), updatedAt: new Date(), updatedBy: userId },
        }),
    ),
    auditStatement(db, {
      userId,
      action: "settings.update",
      entityType: "setting",
      diff: Object.fromEntries(changes.map(([key, value]) => [key, { from: current[key], to: value }])),
    }),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return { ok: true, changed: changes.map(([key]) => key) };
}
