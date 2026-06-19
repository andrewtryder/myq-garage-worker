import { parseConfiguredDoors } from './doors';
import { formatDuration } from './status-page';
import { getDoorState } from './storage';
import { Env } from './types';

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

export function getAlertThresholdMinutes(env: Env): number {
  const thresholdStr = env.ALERT_OPEN_THRESHOLD_MINUTES || '60';
  const thresholdMinutes = parseInt(thresholdStr, 10);
  if (isNaN(thresholdMinutes) || thresholdMinutes <= 0) {
    return 60;
  }
  return thresholdMinutes;
}

export async function runOpenDoorAlerts(
  env: Env,
  options?: { forceDoorName?: string; nowMs?: number },
): Promise<AlertResult[]> {
  if (!env.WEBHOOK_URL) {
    return [{ door: '', sent: false, skippedReason: 'WEBHOOK_URL not configured' }];
  }

  const thresholdMinutes = getAlertThresholdMinutes(env);
  const thresholdMs = thresholdMinutes * 60 * 1000;
  const nowMs = options?.nowMs ?? Date.now();
  const configuredDoors = parseConfiguredDoors(env);
  const results: AlertResult[] = [];

  const doorsToCheck = options?.forceDoorName
    ? Object.entries(configuredDoors).filter(([name]) => name === options.forceDoorName)
    : Object.entries(configuredDoors);

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
      const response = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      results.push({
        door: doorName,
        sent: response.ok,
        payload,
        webhookStatus: response.status,
        skippedReason: response.ok ? undefined : `Webhook returned HTTP ${response.status}`,
      });

      if (response.ok) {
        console.log(`Successfully sent webhook for ${doorName}.`);
      } else {
        console.error(`Failed to send webhook for ${doorName}. Status: ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error sending webhook for ${doorName}:`, err);
      results.push({
        door: doorName,
        sent: false,
        payload,
        error: message,
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
