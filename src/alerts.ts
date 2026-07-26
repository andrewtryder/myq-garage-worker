import { AlertConfig, getAlertConfig } from './alert-config';
import { loadConfig } from './config';
import { formatDuration } from './status-page';
import { getAlertLatch, getDoorState, setAlertLatch } from './storage';
import { Env } from './types';
import { WEBHOOK_FETCH_TIMEOUT_MS } from './webhook-url';

export interface AlertPayload {
  title: string;
  message: string;
  door: string;
  state: string;
  durationMs: number;
  durationText: string;
}

export interface AlertResult {
  door: string;
  sent: boolean;
  payload?: AlertPayload;
  webhookStatus?: number;
  skippedReason?: string;
  error?: string;
}

export async function sendWebhook(config: AlertConfig, payload: AlertPayload): Promise<Response> {
  const init: RequestInit = {
    redirect: 'manual',
    signal: AbortSignal.timeout(WEBHOOK_FETCH_TIMEOUT_MS),
  };

  if (config.method === 'GET') {
    const url = new URL(config.webhookUrl);
    url.searchParams.set('title', payload.title);
    url.searchParams.set('message', payload.message);
    url.searchParams.set('door', payload.door);
    url.searchParams.set('state', payload.state);
    url.searchParams.set('durationText', payload.durationText);
    url.searchParams.set('durationMs', String(payload.durationMs));
    return fetch(url.toString(), { ...init, method: 'GET' });
  }

  return fetch(config.webhookUrl, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
  const payload: AlertPayload = {
    title: 'Garage Door Alert',
    message: doorName
      ? `Test alert for ${doorName} from myq-garage-worker.`
      : 'Test alert from myq-garage-worker.',
    door: doorName || 'Test',
    state: 'OPEN',
    durationMs: 0,
    durationText: 'Test',
  };

  try {
    const response = await sendWebhook(config, payload);
    if (response.status >= 300 && response.status < 400) {
      return {
        door: payload.door,
        sent: false,
        payload,
        webhookStatus: response.status,
        skippedReason: 'Webhook redirects are not allowed',
      };
    }
    return {
      door: payload.door,
      sent: response.ok,
      payload,
      webhookStatus: response.status,
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

function shouldSendAlert(
  latch: { openCreatedAt: string; lastAlertSentAt: string } | null,
  openCreatedAt: string,
  nowMs: number,
  reminderMinutes: number | undefined,
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

  const thresholdMinutes = config.thresholdMinutes;
  const thresholdMs = thresholdMinutes * 60 * 1000;
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
    const force = !!options?.forceDoorName;

    if (!force && durationMs <= thresholdMs) {
      results.push({
        door: doorName,
        sent: false,
        skippedReason: `Open for ${formatDuration(durationMs)} (threshold ${thresholdMinutes} min)`,
      });
      continue;
    }

    if (!force) {
      const latch = await getAlertLatch(env, doorKey);
      const decision = shouldSendAlert(latch, state.createdAt, nowMs, config.reminderMinutes);
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
    const payload: AlertPayload = {
      title: 'Garage Door Alert',
      message: `${doorName} has been open for ${durationText}.`,
      door: doorName,
      state: state.value,
      durationMs,
      durationText,
    };

    try {
      const response = await sendWebhook(config, payload);

      if (response.status >= 300 && response.status < 400) {
        results.push({
          door: doorName,
          sent: false,
          payload,
          webhookStatus: response.status,
          skippedReason: 'Webhook redirects are not allowed',
        });
        continue;
      }

      results.push({
        door: doorName,
        sent: response.ok,
        payload,
        webhookStatus: response.status,
        skippedReason: response.ok ? undefined : `Webhook returned HTTP ${response.status}`,
      });

      if (response.ok) {
        console.log(`Successfully sent webhook for ${doorName}.`);
        if (!force) {
          await setAlertLatch(env, doorKey, {
            openCreatedAt: state.createdAt,
            lastAlertSentAt: new Date(nowMs).toISOString(),
          });
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
        skippedReason: `No doors open past ${thresholdMinutes} min`,
      },
    ];
  }

  return results;
}
