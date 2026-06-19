import { Env } from './types';

export const ALERT_CONFIG_KEY = 'config:alerts';

export interface AlertConfig {
  webhookUrl: string;
  thresholdMinutes: number;
  method: 'GET' | 'POST';
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

  if (!webhookUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return null;
  }

  if (isNaN(thresholdMinutes) || thresholdMinutes <= 0) return null;
  if (!method) return null;

  return {
    webhookUrl,
    thresholdMinutes,
    method,
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
  return validateAlertConfig({
    webhookUrl: body.webhookUrl ?? saved?.webhookUrl,
    thresholdMinutes: body.thresholdMinutes ?? saved?.thresholdMinutes ?? 60,
    method: body.method ?? saved?.method ?? 'POST',
  });
}
