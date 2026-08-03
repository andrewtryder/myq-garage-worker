import { AlertConfig, getAlertConfig, getDoorAlertSettings } from './alert-config';
import { loadConfig } from './config';
import { formatDuration } from './format';
import { getAlertLatch, getDoorState, setAlertLatch } from './storage';
import { Env } from './types';
import { buildWebhookRequest, PlaceholderContext } from './webhook-payload';
import { WEBHOOK_FETCH_TIMEOUT_MS } from './webhook-url';

export interface AlertPayload {
  title: string;
  message: string;
  door: string;
  state: string;
  durationMs: number;
  durationText: string;
  timestamp: string;
}

export interface AlertResult {
  door: string;
  sent: boolean;
  payload?: AlertPayload;
  webhookStatus?: number;
  responseBody?: string;
  skippedReason?: string;
  error?: string;
}

const RESPONSE_BODY_MAX = 2000;

async function readResponseBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    return text.length > RESPONSE_BODY_MAX ? `${text.slice(0, RESPONSE_BODY_MAX)}…` : text;
  } catch {
    return undefined;
  }
}

function contextFromPayload(payload: AlertPayload): PlaceholderContext {
  return {
    door: payload.door,
    state: payload.state,
    minutes: payload.durationText,
    timestamp: payload.timestamp,
  };
}

export async function sendWebhook(config: AlertConfig, payload: AlertPayload): Promise<Response> {
  const built = buildWebhookRequest({
    webhookUrl: config.webhookUrl,
    method: config.method,
    contentType: config.contentType,
    arguments: config.arguments,
    context: contextFromPayload(payload),
  });

  const init: RequestInit = {
    method: built.method,
    redirect: 'manual',
    signal: AbortSignal.timeout(WEBHOOK_FETCH_TIMEOUT_MS),
  };
  if (built.headers) init.headers = built.headers;
  if (built.body !== undefined) init.body = built.body;

  return fetch(built.url, init);
}

function genericWebhookError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'Webhook request timed out';
  }
  if (err instanceof Error && /abort|timeout/i.test(err.message)) {
    return 'Webhook request timed out';
  }
  return 'Webhook request failed';
}

export async function testAlert(config: AlertConfig, doorName?: string): Promise<AlertResult> {
  const nowIso = new Date().toISOString();
  const payload: AlertPayload = {
    title: 'Garage Door Alert',
    message: doorName
      ? `Test alert for ${doorName} from myq-garage-worker.`
      : 'Test alert from myq-garage-worker.',
    door: doorName || 'Test',
    state: 'OPEN',
    durationMs: 0,
    durationText: 'Test',
    timestamp: nowIso,
  };

  try {
    const response = await sendWebhook(config, payload);
    const responseBody = await readResponseBody(response);
    if (response.status >= 300 && response.status < 400) {
      return {
        door: payload.door,
        sent: false,
        payload,
        webhookStatus: response.status,
        responseBody,
        skippedReason: 'Webhook redirects are not allowed',
      };
    }
    return {
      door: payload.door,
      sent: response.ok,
      payload,
      webhookStatus: response.status,
      responseBody,
      skippedReason: response.ok ? undefined : `Webhook returned HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      door: payload.door,
      sent: false,
      payload,
      error: genericWebhookError(err),
    };
  }
}

export function shouldSendAlert(
  latch: { openCreatedAt: string; lastAlertSentAt: string } | null,
  openCreatedAt: string,
  nowMs: number,
  reminderMinutes: number | null | undefined,
): { send: boolean; reason?: string } {
  if (!latch || latch.openCreatedAt !== openCreatedAt) {
    return { send: true };
  }

  if (!reminderMinutes || reminderMinutes <= 0) {
    return { send: false, reason: 'Alert already sent for this open session' };
  }

  const lastSentMs = Date.parse(latch.lastAlertSentAt);
  if (isNaN(lastSentMs)) {
    return { send: true };
  }

  const reminderMs = reminderMinutes * 60 * 1000;
  if (nowMs - lastSentMs >= reminderMs) {
    return { send: true };
  }

  return { send: false, reason: 'Alert reminder cooldown active' };
}

export async function runOpenDoorAlerts(
  env: Env,
  options?: { config?: AlertConfig; forceDoorName?: string; nowMs?: number },
): Promise<AlertResult[]> {
  const config = options?.config ?? (await getAlertConfig(env));
  if (!config) {
    return [{ door: '', sent: false, skippedReason: 'Alert webhook not configured' }];
  }

  const nowMs = options?.nowMs ?? Date.now();
  const { garageDoors } = loadConfig(env);
  const results: AlertResult[] = [];

  const doorsToCheck = options?.forceDoorName
    ? Object.entries(garageDoors).filter(([name]) => name === options.forceDoorName)
    : Object.entries(garageDoors);

  if (options?.forceDoorName && doorsToCheck.length === 0) {
    return [{ door: options.forceDoorName, sent: false, skippedReason: 'Unknown door name' }];
  }

  for (const [doorName, doorKey] of doorsToCheck) {
    const force = !!options?.forceDoorName;

    if (!force) {
      const doorAlerts = await getDoorAlertSettings(env, doorKey);
      if (!doorAlerts?.alertsEnabled) {
        results.push({
          door: doorName,
          sent: false,
          skippedReason: 'Alerts disabled for this door',
        });
        continue;
      }
    }

    const state = await getDoorState(env, doorKey);

    if (state.value !== 'OPEN' || !state.createdAt) {
      if (options?.forceDoorName) {
        results.push({
          door: doorName,
          sent: false,
          skippedReason:
            state.value !== 'OPEN'
              ? `Door is ${state.value || 'UNKNOWN'}`
              : 'No timestamp recorded',
        });
      }
      continue;
    }

    const createdAtMs = new Date(state.createdAt).getTime();
    if (isNaN(createdAtMs)) {
      if (options?.forceDoorName) {
        results.push({ door: doorName, sent: false, skippedReason: 'Invalid timestamp' });
      }
      continue;
    }

    const durationMs = nowMs - createdAtMs;
    const doorAlerts = force
      ? {
          alertsEnabled: true,
          notifyAfterMinutes: 0,
          reminderIntervalMinutes: null as number | null,
        }
      : await getDoorAlertSettings(env, doorKey);

    const notifyAfterMinutes = doorAlerts?.notifyAfterMinutes ?? 30;
    const thresholdMs = notifyAfterMinutes * 60 * 1000;

    if (!force && durationMs <= thresholdMs) {
      results.push({
        door: doorName,
        sent: false,
        skippedReason: `Open for ${formatDuration(durationMs)} (threshold ${notifyAfterMinutes} min)`,
      });
      continue;
    }

    if (!force) {
      const latch = await getAlertLatch(env, doorKey);
      const decision = shouldSendAlert(
        latch,
        state.createdAt,
        nowMs,
        doorAlerts?.reminderIntervalMinutes,
      );
      if (!decision.send) {
        results.push({
          door: doorName,
          sent: false,
          skippedReason: decision.reason,
        });
        continue;
      }
    }

    const durationText = formatDuration(durationMs);
    const timestamp = new Date(nowMs).toISOString();
    const payload: AlertPayload = {
      title: 'Garage Door Alert',
      message: `${doorName} has been open for ${durationText}.`,
      door: doorName,
      state: state.value,
      durationMs,
      durationText,
      timestamp,
    };

    try {
      const response = await sendWebhook(config, payload);
      const responseBody = await readResponseBody(response);

      if (response.status >= 300 && response.status < 400) {
        results.push({
          door: doorName,
          sent: false,
          payload,
          webhookStatus: response.status,
          responseBody,
          skippedReason: 'Webhook redirects are not allowed',
        });
        continue;
      }

      const sent = response.ok;

      results.push({
        door: doorName,
        sent,
        payload,
        webhookStatus: response.status,
        responseBody,
        skippedReason: sent ? undefined : `Webhook returned HTTP ${response.status}`,
      });

      if (sent) {
        console.log(`Successfully sent webhook for ${doorName}.`);
        if (!force) {
          try {
            await setAlertLatch(env, doorKey, {
              openCreatedAt: state.createdAt,
              lastAlertSentAt: timestamp,
            });
          } catch (error) {
            console.error('Webhook sent but latch persistence failed', error);
          }
        }
      } else {
        console.error(`Failed to send webhook for ${doorName}. Status: ${response.status}`);
      }
    } catch (err) {
      console.error(`Error sending webhook for ${doorName}:`, err);
      results.push({
        door: doorName,
        sent: false,
        payload,
        error: genericWebhookError(err),
      });
    }
  }

  if (results.length === 0) {
    return [
      {
        door: '',
        sent: false,
        skippedReason: 'No doors open past their notify threshold',
      },
    ];
  }

  return results;
}
