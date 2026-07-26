import { Env } from './types';
import { assertSafeWebhookUrl, redactWebhookUrl } from './webhook-url';

export const ALERT_CONFIG_KEY = 'config:alerts';

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
    const raw = await env.GARAGE_STATE.get(ALERT_CONFIG_KEY);
    if (!raw) return null;
    return validateAlertConfig(JSON.parse(raw));
  } catch (err) {
    console.error('Failed to read alert config from KV:', err);
    return null;
  }
}

export async function saveAlertConfig(env: Env, input: unknown): Promise<AlertConfig> {
  const config = validateAlertConfig(input);
  if (!config) {
    throw new Error('Invalid alert configuration');
  }

  await env.GARAGE_STATE.put(ALERT_CONFIG_KEY, JSON.stringify(config));
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
