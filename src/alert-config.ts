import { Env } from './types';
import { assertSafeWebhookUrl, redactWebhookUrl } from './webhook-url';

export interface AlertConfig {
  webhookUrl: string;
  thresholdMinutes: number;
  method: 'GET' | 'POST';
  /** Minutes between reminder alerts after the first; omit or 0 for once-only. */
  reminderMinutes?: number;
}

export interface PublicAlertConfig {
  webhookUrl: string;
  thresholdMinutes: number;
  method: 'GET' | 'POST';
  reminderMinutes?: number;
}

export function toPublicAlertConfig(config: AlertConfig | null): PublicAlertConfig | null {
  if (!config) return null;
  return {
    webhookUrl: redactWebhookUrl(config.webhookUrl),
    thresholdMinutes: config.thresholdMinutes,
    method: config.method,
    reminderMinutes: config.reminderMinutes,
  };
}

export function validateAlertConfig(input: unknown): AlertConfig | null {
  if (typeof input !== 'object' || input === null) return null;

  const record = input as Record<string, unknown>;
  const webhookUrl = typeof record.webhookUrl === 'string' ? record.webhookUrl.trim() : '';
  const thresholdMinutes =
    typeof record.thresholdMinutes === 'number'
      ? record.thresholdMinutes
      : parseInt(String(record.thresholdMinutes ?? ''), 10);
  const method = record.method === 'GET' || record.method === 'POST' ? record.method : null;

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

  if (!webhookUrl) return null;

  try {
    assertSafeWebhookUrl(webhookUrl);
  } catch {
    return null;
  }

  if (isNaN(thresholdMinutes) || thresholdMinutes <= 0) return null;
  if (!method) return null;

  return {
    webhookUrl,
    thresholdMinutes,
    method,
    reminderMinutes,
  };
}

export async function getAlertConfig(env: Env): Promise<AlertConfig | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT webhook_url, threshold_minutes, reminder_minutes, method
       FROM alert_config WHERE id = 1`,
    ).first<{
      webhook_url: string;
      threshold_minutes: number;
      reminder_minutes: number | null;
      method: string;
    }>();

    if (!row) return null;
    return validateAlertConfig({
      webhookUrl: row.webhook_url,
      thresholdMinutes: row.threshold_minutes,
      reminderMinutes: row.reminder_minutes ?? undefined,
      method: row.method,
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
  await env.GARAGE_DB.prepare(
    `INSERT INTO alert_config (id, webhook_url, threshold_minutes, reminder_minutes, method, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       webhook_url = excluded.webhook_url,
       threshold_minutes = excluded.threshold_minutes,
       reminder_minutes = excluded.reminder_minutes,
       method = excluded.method,
       updated_at = excluded.updated_at`,
  )
    .bind(
      config.webhookUrl,
      config.thresholdMinutes,
      config.reminderMinutes ?? null,
      config.method,
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
    thresholdMinutes: body.thresholdMinutes ?? saved?.thresholdMinutes ?? 60,
    method: body.method ?? saved?.method ?? 'POST',
    reminderMinutes: body.reminderMinutes ?? saved?.reminderMinutes,
  });
}
