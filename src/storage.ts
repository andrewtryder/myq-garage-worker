import { isDoorStatus } from './config';
import { DoorState, DoorStatus, Env, AlertLatch } from './types';

const HISTORY_PREFIX = 'event:';
const HISTORY_LIMIT = 10;
const MESSAGE_ID_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function historyEventKey(doorKey: string, createdAt: string, id: string): string {
  return `${HISTORY_PREFIX}${doorKey}:${createdAt}:${id}`;
}

function alertLatchKey(doorKey: string): string {
  return `alert-latch:${doorKey}`;
}

function messageIdKey(messageId: string): string {
  return `msgid:${messageId}`;
}

export async function saveDoorState(
  env: Env,
  doorKey: string,
  value: DoorStatus,
): Promise<DoorState> {
  const existing = await getDoorState(env, doorKey);
  const now = new Date().toISOString();

  // Preserve open-since timestamp across duplicate OPEN notifications.
  const createdAt =
    value === 'OPEN' && existing.value === 'OPEN' && existing.createdAt ? existing.createdAt : now;

  const newState: DoorState = {
    value,
    createdAt,
  };

  await env.GARAGE_STATE.put(doorKey, JSON.stringify(newState));

  // Reset alert latch when the door leaves OPEN.
  if (value !== 'OPEN') {
    try {
      await env.GARAGE_STATE.delete(alertLatchKey(doorKey));
    } catch (err) {
      console.error(`Failed to clear alert latch for ${doorKey}:`, err);
    }
  }

  // Append-only history event (avoids lost updates from read-modify-write races).
  if (!(value === existing.value && createdAt === existing.createdAt)) {
    try {
      const id = crypto.randomUUID();
      await env.GARAGE_STATE.put(historyEventKey(doorKey, now, id), JSON.stringify(newState));
    } catch (err) {
      console.error(`Failed to append state history for ${doorKey}:`, err);
    }
  }

  console.log(`Saved state to KV for ${doorKey}: ${value}`);
  return newState;
}

export async function getDoorState(env: Env, doorKey: string): Promise<DoorState> {
  try {
    const raw = await env.GARAGE_STATE.get(doorKey);
    if (!raw) {
      return { value: 'UNKNOWN', createdAt: '' };
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const state = parsed as Record<string, unknown>;
      const value =
        typeof state.value === 'string' && isDoorStatus(state.value) ? state.value : 'UNKNOWN';
      return {
        value,
        createdAt: typeof state.createdAt === 'string' ? state.createdAt : '',
      };
    }
    return { value: 'UNKNOWN', createdAt: '' };
  } catch (err) {
    console.error(`Error reading KV for ${doorKey}:`, err);
    return { value: 'UNKNOWN', createdAt: '' };
  }
}

async function readLegacyHistoryArray(env: Env, doorKey: string): Promise<DoorState[]> {
  try {
    const raw = await env.GARAGE_STATE.get(`history:${doorKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown) => {
      if (typeof item === 'object' && item !== null) {
        const state = item as Record<string, unknown>;
        const value =
          typeof state.value === 'string' && isDoorStatus(state.value) ? state.value : 'UNKNOWN';
        return {
          value,
          createdAt: typeof state.createdAt === 'string' ? state.createdAt : '',
        };
      }
      return { value: 'UNKNOWN' as const, createdAt: '' };
    });
  } catch {
    return [];
  }
}

export async function getDoorHistory(env: Env, doorKey: string): Promise<DoorState[]> {
  try {
    const listed = await env.GARAGE_STATE.list({ prefix: `${HISTORY_PREFIX}${doorKey}:` });
    const keys = listed.keys
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, HISTORY_LIMIT);

    if (keys.length === 0) {
      return readLegacyHistoryArray(env, doorKey);
    }

    const values = await Promise.all(keys.map((key) => env.GARAGE_STATE.get(key)));
    const events: DoorState[] = [];

    for (const raw of values) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const value =
          typeof parsed.value === 'string' && isDoorStatus(parsed.value) ? parsed.value : 'UNKNOWN';
        events.push({
          value,
          createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
        });
      } catch {
        // skip malformed event
      }
    }

    return events;
  } catch (err) {
    console.error(`Error reading history KV for ${doorKey}:`, err);
    return readLegacyHistoryArray(env, doorKey);
  }
}

export async function getAlertLatch(env: Env, doorKey: string): Promise<AlertLatch | null> {
  try {
    const raw = await env.GARAGE_STATE.get(alertLatchKey(doorKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.openCreatedAt === 'string' && typeof parsed.lastAlertSentAt === 'string') {
      return {
        openCreatedAt: parsed.openCreatedAt,
        lastAlertSentAt: parsed.lastAlertSentAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setAlertLatch(env: Env, doorKey: string, latch: AlertLatch): Promise<void> {
  await env.GARAGE_STATE.put(alertLatchKey(doorKey), JSON.stringify(latch));
}

/** Returns true if this Message-ID was already processed. */
export async function claimMessageId(env: Env, messageId: string | null): Promise<boolean> {
  if (!messageId) return false;
  const normalized = messageId.trim();
  if (!normalized) return false;

  const key = messageIdKey(normalized);
  const existing = await env.GARAGE_STATE.get(key);
  if (existing) return true;

  await env.GARAGE_STATE.put(key, '1', { expirationTtl: MESSAGE_ID_TTL_SECONDS });
  return false;
}
