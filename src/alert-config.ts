import { loadConfig } from './config';
import { Env } from './types';
import { ensureDoor } from './storage';
import { assertSafeWebhookUrl, redactWebhookUrl } from './webhook-url';
import { DEFAULT_WEBHOOK_ARGUMENTS, WebhookArgument, WebhookContentType } from './webhook-payload';

export type { WebhookArgument, WebhookContentType };

export interface AlertConfig {
  webhookUrl: string;
  method: 'GET' | 'POST';
  contentType: WebhookContentType;
  arguments: WebhookArgument[];
  /**
   * @deprecated Per-door notify_after_minutes. Kept only for D1 legacy column writes.
   */
  thresholdMinutes?: number;
  /**
   * @deprecated Per-door reminder_interval_minutes. Kept only for D1 legacy column writes.
   */
  reminderMinutes?: number;
}

export interface PublicAlertConfig {
  webhookUrl: string;
  method: 'GET' | 'POST';
  contentType: WebhookContentType;
  arguments: WebhookArgument[];
}

export interface DoorAlertSettings {
  doorId: string;
  doorName: string;
  alertsEnabled: boolean;
  notifyAfterMinutes: number;
  reminderIntervalMinutes: number | null;
}

const CONTENT_TYPES: WebhookContentType[] = [
  'application/json',
  'application/x-www-form-urlencoded',
  'text/plain',
];

export function toPublicAlertConfig(config: AlertConfig | null): PublicAlertConfig | null {
  if (!config) return null;
  return {
    webhookUrl: redactWebhookUrl(config.webhookUrl),
    method: config.method,
    contentType: config.contentType,
    arguments: config.arguments,
  };
}

function parseArguments(raw: unknown): WebhookArgument[] | null {
  if (raw === undefined || raw === null) {
    return [...DEFAULT_WEBHOOK_ARGUMENTS];
  }
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const args: WebhookArgument[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || typeof record.value !== 'string') return null;
    const key = record.key.trim();
    if (!key) return null;
    args.push({ key, value: record.value });
  }
  return args;
}

function parseContentType(raw: unknown): WebhookContentType | null {
  if (raw === undefined || raw === null || raw === '') return 'application/json';
  if (typeof raw !== 'string') return null;
  return CONTENT_TYPES.includes(raw as WebhookContentType) ? (raw as WebhookContentType) : null;
}

export function validateAlertConfig(input: unknown): AlertConfig | null {
  if (typeof input !== 'object' || input === null) return null;

  const record = input as Record<string, unknown>;
  const webhookUrl = typeof record.webhookUrl === 'string' ? record.webhookUrl.trim() : '';
  const method = record.method === 'GET' || record.method === 'POST' ? record.method : null;
  const contentType = parseContentType(record.contentType);
  const args = parseArguments(record.arguments ?? record.argumentsJson);

  if (!webhookUrl) return null;

  try {
    assertSafeWebhookUrl(webhookUrl);
  } catch {
    return null;
  }

  if (!method || !contentType || !args) return null;

  // Legacy optional fields (ignored by cron; still accepted for back-compat tests/clients)
  let thresholdMinutes: number | undefined;
  if (record.thresholdMinutes !== undefined && record.thresholdMinutes !== null) {
    thresholdMinutes =
      typeof record.thresholdMinutes === 'number'
        ? record.thresholdMinutes
        : parseInt(String(record.thresholdMinutes), 10);
    if (isNaN(thresholdMinutes) || thresholdMinutes <= 0) return null;
  }

  let reminderMinutes: number | undefined;
  if (
    record.reminderMinutes !== undefined &&
    record.reminderMinutes !== null &&
    record.reminderMinutes !== ''
  ) {
    reminderMinutes =
      typeof record.reminderMinutes === 'number'
        ? record.reminderMinutes
        : parseInt(String(record.reminderMinutes), 10);
    if (isNaN(reminderMinutes) || reminderMinutes < 0) return null;
    if (reminderMinutes === 0) reminderMinutes = undefined;
  }

  return {
    webhookUrl,
    method,
    contentType,
    arguments: args,
    thresholdMinutes,
    reminderMinutes,
  };
}

export async function getAlertConfig(env: Env): Promise<AlertConfig | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT webhook_url, method, content_type, arguments_json,
              threshold_minutes, reminder_minutes
       FROM alert_config WHERE id = 1`,
    ).first<{
      webhook_url: string;
      method: string;
      content_type: string | null;
      arguments_json: string | null;
      threshold_minutes: number;
      reminder_minutes: number | null;
    }>();

    if (!row) return null;
    return validateAlertConfig({
      webhookUrl: row.webhook_url,
      method: row.method,
      contentType: row.content_type ?? 'application/json',
      arguments: row.arguments_json ?? '[]',
      thresholdMinutes: row.threshold_minutes,
      reminderMinutes: row.reminder_minutes ?? undefined,
    });
  } catch (err) {
    console.error('Failed to read alert config from D1:', err);
    return null;
  }
}

export async function saveAlertConfig(env: Env, input: unknown): Promise<AlertConfig> {
  const config = validateAlertConfig(input);
  if (!config) {
    throw new Error('Invalid alert configuration');
  }

  const now = new Date().toISOString();
  // Keep legacy columns populated for older readers / migration compatibility.
  const legacyThreshold = config.thresholdMinutes ?? 30;
  const legacyReminder = config.reminderMinutes ?? null;

  await env.GARAGE_DB.prepare(
    `INSERT INTO alert_config (
       id, webhook_url, threshold_minutes, reminder_minutes, method,
       content_type, arguments_json, updated_at
     )
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       webhook_url = excluded.webhook_url,
       threshold_minutes = excluded.threshold_minutes,
       reminder_minutes = excluded.reminder_minutes,
       method = excluded.method,
       content_type = excluded.content_type,
       arguments_json = excluded.arguments_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      config.webhookUrl,
      legacyThreshold,
      legacyReminder,
      config.method,
      config.contentType,
      JSON.stringify(config.arguments),
      now,
    )
    .run();

  return config;
}

export function resolveAlertConfigFromBody(
  body: Record<string, unknown>,
  saved: AlertConfig | null,
): AlertConfig | null {
  const bodyUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
  return validateAlertConfig({
    webhookUrl: bodyUrl || saved?.webhookUrl,
    method: body.method ?? saved?.method ?? 'POST',
    contentType: body.contentType ?? saved?.contentType ?? 'application/json',
    arguments: body.arguments ?? saved?.arguments ?? DEFAULT_WEBHOOK_ARGUMENTS,
    thresholdMinutes: body.thresholdMinutes ?? saved?.thresholdMinutes ?? 30,
    reminderMinutes: body.reminderMinutes ?? saved?.reminderMinutes,
  });
}

export function validateDoorAlertToggle(input: unknown): { enabled: boolean } | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.enabled === 'boolean') return { enabled: record.enabled };
  if (typeof record.alertsEnabled === 'boolean') return { enabled: record.alertsEnabled };
  return null;
}

function mapDoorAlertRow(
  doorId: string,
  doorName: string,
  row: {
    alerts_enabled: number;
    notify_after_minutes: number;
    reminder_interval_minutes: number | null;
  } | null,
): DoorAlertSettings {
  if (!row) {
    return {
      doorId,
      doorName,
      alertsEnabled: false,
      notifyAfterMinutes: 30,
      reminderIntervalMinutes: null,
    };
  }
  return {
    doorId,
    doorName,
    alertsEnabled: Number(row.alerts_enabled) === 1,
    notifyAfterMinutes: Number(row.notify_after_minutes) || 30,
    reminderIntervalMinutes:
      row.reminder_interval_minutes == null || Number(row.reminder_interval_minutes) === 0
        ? null
        : Number(row.reminder_interval_minutes),
  };
}

export async function listDoorAlertSettings(env: Env): Promise<DoorAlertSettings[]> {
  const garageDoors = loadConfig(env).garageDoors;
  const settings: DoorAlertSettings[] = [];

  for (const [doorName, doorId] of Object.entries(garageDoors)) {
    const row = await env.GARAGE_DB.prepare(
      `SELECT alerts_enabled, notify_after_minutes, reminder_interval_minutes
       FROM doors WHERE id = ?`,
    )
      .bind(doorId)
      .first<{
        alerts_enabled: number;
        notify_after_minutes: number;
        reminder_interval_minutes: number | null;
      }>();

    settings.push(mapDoorAlertRow(doorId, doorName, row));
  }

  return settings;
}

export async function getDoorAlertSettings(
  env: Env,
  doorId: string,
): Promise<DoorAlertSettings | null> {
  const garageDoors = loadConfig(env).garageDoors;
  const doorName = Object.entries(garageDoors).find(([, id]) => id === doorId)?.[0];
  if (!doorName) return null;

  const row = await env.GARAGE_DB.prepare(
    `SELECT alerts_enabled, notify_after_minutes, reminder_interval_minutes
     FROM doors WHERE id = ?`,
  )
    .bind(doorId)
    .first<{
      alerts_enabled: number;
      notify_after_minutes: number;
      reminder_interval_minutes: number | null;
    }>();

  return mapDoorAlertRow(doorId, doorName, row);
}

export async function updateDoorAlertSettings(
  env: Env,
  doorId: string,
  patch: {
    alertsEnabled?: boolean;
    notifyAfterMinutes?: number;
    reminderIntervalMinutes?: number | null;
  },
): Promise<DoorAlertSettings | null> {
  const current = await getDoorAlertSettings(env, doorId);
  if (!current) return null;

  const next = {
    alertsEnabled: patch.alertsEnabled ?? current.alertsEnabled,
    notifyAfterMinutes: patch.notifyAfterMinutes ?? current.notifyAfterMinutes,
    reminderIntervalMinutes:
      patch.reminderIntervalMinutes !== undefined
        ? patch.reminderIntervalMinutes
        : current.reminderIntervalMinutes,
  };

  if (next.notifyAfterMinutes <= 0) {
    throw new Error('Invalid notifyAfterMinutes');
  }

  await ensureDoor(env, doorId, current.doorName);

  await env.GARAGE_DB.prepare(
    `UPDATE doors
     SET alerts_enabled = ?,
         notify_after_minutes = ?,
         reminder_interval_minutes = ?
     WHERE id = ?`,
  )
    .bind(next.alertsEnabled ? 1 : 0, next.notifyAfterMinutes, next.reminderIntervalMinutes, doorId)
    .run();

  return {
    doorId,
    doorName: current.doorName,
    ...next,
  };
}

export async function saveDoorAlertSettingsBatch(
  env: Env,
  doors: Array<{
    doorId: string;
    alertsEnabled: boolean;
    notifyAfterMinutes: number;
    reminderIntervalMinutes: number | null;
  }>,
): Promise<DoorAlertSettings[]> {
  const results: DoorAlertSettings[] = [];
  for (const door of doors) {
    const updated = await updateDoorAlertSettings(env, door.doorId, door);
    if (updated) results.push(updated);
  }
  return results;
}
