import { isDoorStatus } from './config';
import { DoorState, DoorStatus, Env, AlertLatch } from './types';

const HISTORY_REVERSE_PREFIX = 'eventr:';
const HISTORY_LEGACY_PREFIX = 'event:';
const HISTORY_LIMIT = 10;
/** 90-day retention for reverse-chrono history events. */
const HISTORY_TTL_SECONDS = 90 * 24 * 60 * 60;
const MESSAGE_ID_DONE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MESSAGE_ID_PENDING_TTL_SECONDS = 5 * 60; // 5 minutes

function invertedTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return String(Number.MAX_SAFE_INTEGER - safeMs).padStart(16, '0');
}

function historyEventKey(doorKey: string, createdAt: string, id: string): string {
  return `${HISTORY_REVERSE_PREFIX}${doorKey}:${invertedTimestamp(createdAt)}:${id}`;
}

function alertLatchKey(doorKey: string): string {
  return `alert-latch:${doorKey}`;
}

function messageIdPendingKey(hash: string): string {
  return `msgid:pending:${hash}`;
}

function messageIdDoneKey(hash: string): string {
  return `msgid:done:${hash}`;
}

async function hashMessageId(normalized: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseDoorStateRaw(raw: string | null): DoorState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value =
      typeof parsed.value === 'string' && isDoorStatus(parsed.value) ? parsed.value : 'UNKNOWN';
    return {
      value,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    };
  } catch {
    return null;
  }
}

async function readHistoryFromKeys(env: Env, keys: string[]): Promise<DoorState[]> {
  const values = await Promise.all(keys.map((key) => env.GARAGE_STATE.get(key)));
  const events: DoorState[] = [];
  for (const raw of values) {
    const state = parseDoorStateRaw(raw);
    if (state) events.push(state);
  }
  return events;
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

  // Append-only reverse-chrono history (newest keys first under lexicographic list).
  if (!(value === existing.value && createdAt === existing.createdAt)) {
    try {
      const id = crypto.randomUUID();
      await env.GARAGE_STATE.put(historyEventKey(doorKey, now, id), JSON.stringify(newState), {
        expirationTtl: HISTORY_TTL_SECONDS,
      });
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
    return parseDoorStateRaw(raw) ?? { value: 'UNKNOWN', createdAt: '' };
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

async function readLegacyIsoEvents(env: Env, doorKey: string): Promise<DoorState[]> {
  const listed = await env.GARAGE_STATE.list({ prefix: `${HISTORY_LEGACY_PREFIX}${doorKey}:` });
  const keys = listed.keys
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, HISTORY_LIMIT);
  return readHistoryFromKeys(env, keys);
}

export async function getDoorHistory(env: Env, doorKey: string): Promise<DoorState[]> {
  try {
    const listed = await env.GARAGE_STATE.list({
      prefix: `${HISTORY_REVERSE_PREFIX}${doorKey}:`,
      limit: HISTORY_LIMIT,
    });
    const modernKeys = listed.keys.map((entry) => entry.name);
    const modern = await readHistoryFromKeys(env, modernKeys);

    if (modern.length >= HISTORY_LIMIT) {
      return modern.slice(0, HISTORY_LIMIT);
    }

    const legacyIso = await readLegacyIsoEvents(env, doorKey);
    const legacyArray = await readLegacyHistoryArray(env, doorKey);

    if (modern.length === 0 && legacyIso.length === 0) {
      return legacyArray;
    }

    const merged = [...modern];
    for (const event of [...legacyIso, ...legacyArray]) {
      if (merged.length >= HISTORY_LIMIT) break;
      merged.push(event);
    }
    return merged;
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

/**
 * Begin processing a Message-ID. Returns true if this delivery should be skipped
 * (already completed or currently in flight).
 */
export async function beginMessageProcessing(env: Env, messageId: string | null): Promise<boolean> {
  if (!messageId) return false;
  const normalized = messageId.trim();
  if (!normalized) return false;

  const hash = await hashMessageId(normalized);
  const doneKey = messageIdDoneKey(hash);
  const pendingKey = messageIdPendingKey(hash);

  if (await env.GARAGE_STATE.get(doneKey)) return true;
  if (await env.GARAGE_STATE.get(pendingKey)) return true;

  await env.GARAGE_STATE.put(pendingKey, '1', {
    expirationTtl: MESSAGE_ID_PENDING_TTL_SECONDS,
  });
  return false;
}

/** Mark a Message-ID as successfully processed after state is saved. */
export async function completeMessageProcessing(env: Env, messageId: string | null): Promise<void> {
  if (!messageId) return;
  const normalized = messageId.trim();
  if (!normalized) return;

  const hash = await hashMessageId(normalized);
  const doneKey = messageIdDoneKey(hash);
  const pendingKey = messageIdPendingKey(hash);

  await env.GARAGE_STATE.put(doneKey, '1', {
    expirationTtl: MESSAGE_ID_DONE_TTL_SECONDS,
  });
  try {
    await env.GARAGE_STATE.delete(pendingKey);
  } catch (err) {
    console.error('Failed to clear pending Message-ID marker:', err);
  }
}

/** Clear a pending Message-ID claim when processing fails before state is saved. */
export async function abortMessageProcessing(env: Env, messageId: string | null): Promise<void> {
  if (!messageId) return;
  const normalized = messageId.trim();
  if (!normalized) return;

  const hash = await hashMessageId(normalized);
  const pendingKey = messageIdPendingKey(hash);

  try {
    await env.GARAGE_STATE.delete(pendingKey);
  } catch (err) {
    console.error('Failed to abort pending Message-ID marker:', err);
  }
}
