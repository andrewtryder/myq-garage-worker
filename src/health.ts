import { loadConfig } from './config';
import { HISTORY_RETENTION_DAYS } from './storage';
import { getLatestOpsEvent, OPS_RETENTION_DAYS } from './ops';
import { Env } from './types';

export interface HealthResponse {
  generatedAt: string;
  version: string;
  doorCount: number;
  hasAllowedEmailTo: boolean;
  hasApiKey: boolean;
  historyRetentionDays: number;
  opsRetentionDays: number;
  staleAfterHours: number;
  d1Ok: boolean;
  lastEmailOk: { occurredAt: string; detail: string | null } | null;
  lastEmailReject: { occurredAt: string; detail: string | null } | null;
  lastCronAlerts: { occurredAt: string; detail: string | null } | null;
  lastWebhookOk: { occurredAt: string; detail: string | null } | null;
  lastWebhookFail: { occurredAt: string; detail: string | null } | null;
}

async function pingD1(env: Env): Promise<boolean> {
  try {
    const row = await env.GARAGE_DB.prepare(`SELECT 1 AS ok`).first<{ ok: number }>();
    return row?.ok === 1;
  } catch {
    return false;
  }
}

function mapOps(
  event: { occurredAt: string; detail: string | null } | null,
): { occurredAt: string; detail: string | null } | null {
  if (!event) return null;
  return { occurredAt: event.occurredAt, detail: event.detail };
}

export async function buildHealth(env: Env, nowMs = Date.now()): Promise<HealthResponse> {
  const config = loadConfig(env);
  const [d1Ok, lastEmailOk, lastEmailReject, lastCronAlerts, lastWebhookOk, lastWebhookFail] =
    await Promise.all([
      pingD1(env),
      getLatestOpsEvent(env, 'email_ok'),
      getLatestOpsEvent(env, 'email_reject'),
      getLatestOpsEvent(env, 'cron_alerts'),
      getLatestOpsEvent(env, 'webhook_ok'),
      getLatestOpsEvent(env, 'webhook_fail'),
    ]);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    version: typeof env.VERSION === 'string' && env.VERSION ? env.VERSION : 'unknown',
    doorCount: Object.keys(config.garageDoors).length,
    hasAllowedEmailTo: Boolean(config.allowedEmailTo),
    hasApiKey: Boolean(config.apiKey),
    historyRetentionDays: HISTORY_RETENTION_DAYS,
    opsRetentionDays: OPS_RETENTION_DAYS,
    staleAfterHours: config.staleAfterHours,
    d1Ok,
    lastEmailOk: mapOps(lastEmailOk),
    lastEmailReject: mapOps(lastEmailReject),
    lastCronAlerts: mapOps(lastCronAlerts),
    lastWebhookOk: mapOps(lastWebhookOk),
    lastWebhookFail: mapOps(lastWebhookFail),
  };
}
