import { loadConfig } from './config';
import { DoorState, DoorStatus, Env, AlertLatch } from './types';

const HISTORY_LIMIT = 10;
export const HISTORY_RETENTION_DAYS = 90;

export async function hashMessageId(normalized: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function doorNameForKey(env: Env, doorKey: string): string {
  const doors = loadConfig(env).garageDoors;
  for (const [name, key] of Object.entries(doors)) {
    if (key === doorKey) return name;
  }
  return doorKey;
}

export async function ensureDoor(
  env: Env,
  doorKey: string,
  doorName?: string,
  at?: string,
): Promise<void> {
  const name = doorName ?? doorNameForKey(env, doorKey);
  const now = at ?? new Date().toISOString();
  await env.GARAGE_DB.prepare(
    `INSERT INTO doors (id, name, current_status, state_since, updated_at)
     VALUES (?, ?, 'UNKNOWN', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  )
    .bind(doorKey, name, now)
    .run();
}

export interface SaveDoorOptions {
  messageId?: string | null;
  source?: string;
  doorName?: string;
}

export interface SaveDoorResult {
  state: DoorState;
  /** True when Message-ID was already recorded (duplicate delivery). */
  duplicate: boolean;
  /** True when the chronology-gated door UPDATE applied. */
  applied: boolean;
}

/** Read door state for write paths; rethrows D1 errors instead of coercing to UNKNOWN. */
export async function readDoorStateOrThrow(env: Env, doorKey: string): Promise<DoorState> {
  const row = await env.GARAGE_DB.prepare(
    `SELECT current_status, state_since FROM doors WHERE id = ?`,
  )
    .bind(doorKey)
    .first<{ current_status: string; state_since: string | null }>();

  if (!row) {
    return { value: 'UNKNOWN', createdAt: '' };
  }

  return {
    value: row.current_status as DoorStatus,
    createdAt: row.state_since ?? '',
  };
}

/**
 * Persist a door state change and append history in one D1 batch.
 * When messageId is set, unique hash enforces deduplication — duplicate returns without mutating state.
 */
export async function saveDoorState(
  env: Env,
  doorKey: string,
  value: DoorStatus,
  options: SaveDoorOptions = {},
): Promise<SaveDoorResult> {
  const source = options.source ?? 'manual';
  const now = new Date().toISOString();
  await ensureDoor(env, doorKey, options.doorName, now);

  const existing = await readDoorStateOrThrow(env, doorKey);
  const createdAt =
    value === 'OPEN' && existing.value === 'OPEN' && existing.createdAt ? existing.createdAt : now;
  const newState: DoorState = { value, createdAt };
  const stateSince = createdAt || null;

  let messageIdHash: string | null = null;
  if (options.messageId) {
    const normalized = options.messageId.trim();
    if (normalized) {
      messageIdHash = await hashMessageId(normalized);
    }
  }

  const statements: D1PreparedStatement[] = [];
  let updateIndex = -1;

  if (messageIdHash) {
    statements.push(
      env.GARAGE_DB.prepare(
        `INSERT OR IGNORE INTO door_events (door_id, status, occurred_at, message_id_hash, source)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(doorKey, value, now, messageIdHash, source),
    );
    updateIndex = statements.length;
    statements.push(
      env.GARAGE_DB.prepare(
        `UPDATE doors
         SET current_status = ?, state_since = ?, updated_at = ?
         WHERE id = ?
           AND (updated_at IS NULL OR updated_at <= ?)
           AND EXISTS (
             SELECT 1 FROM door_events
             WHERE message_id_hash = ? AND occurred_at = ?
           )`,
      ).bind(value, stateSince, now, doorKey, now, messageIdHash, now),
    );
  } else {
    const shouldAppend = !(value === existing.value && createdAt === existing.createdAt);
    if (shouldAppend) {
      statements.push(
        env.GARAGE_DB.prepare(
          `INSERT INTO door_events (door_id, status, occurred_at, message_id_hash, source)
           VALUES (?, ?, ?, NULL, ?)`,
        ).bind(doorKey, value, now, source),
      );
    }
    updateIndex = statements.length;
    statements.push(
      env.GARAGE_DB.prepare(
        `UPDATE doors
         SET current_status = ?, state_since = ?, updated_at = ?
         WHERE id = ?
           AND (updated_at IS NULL OR updated_at <= ?)`,
      ).bind(value, stateSince, now, doorKey, now),
    );
  }

  if (value !== 'OPEN') {
    statements.push(
      env.GARAGE_DB.prepare(
        `DELETE FROM alert_state
         WHERE door_id = ?
           AND EXISTS (
             SELECT 1 FROM doors
             WHERE id = ?
               AND current_status = ?
               AND updated_at = ?
           )`,
      ).bind(doorKey, doorKey, value, now),
    );
  }

  const results = await env.GARAGE_DB.batch(statements);

  if (messageIdHash) {
    const inserted = results[0]?.meta?.changes ?? 0;
    if (inserted === 0) {
      const current = await readDoorStateOrThrow(env, doorKey);
      return { state: current, duplicate: true, applied: false };
    }
  }

  const applied = (results[updateIndex]?.meta?.changes ?? 0) > 0;
  if (!applied) {
    const current = await readDoorStateOrThrow(env, doorKey);
    return { state: current, duplicate: false, applied: false };
  }

  console.log(`Saved state to D1 for ${doorKey}: ${value}`);
  return { state: newState, duplicate: false, applied: true };
}

export async function getDoorState(env: Env, doorKey: string): Promise<DoorState> {
  try {
    return await readDoorStateOrThrow(env, doorKey);
  } catch (err) {
    console.error(`Error reading D1 for ${doorKey}:`, err);
    return { value: 'UNKNOWN', createdAt: '' };
  }
}

export async function getDoorHistory(env: Env, doorKey: string): Promise<DoorState[]> {
  try {
    const result = await env.GARAGE_DB.prepare(
      `SELECT status, occurred_at
       FROM door_events
       WHERE door_id = ?
       ORDER BY occurred_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(doorKey, HISTORY_LIMIT)
      .all<{ status: string; occurred_at: string }>();

    return (result.results ?? []).map((row) => ({
      value: row.status as DoorStatus,
      createdAt: row.occurred_at,
    }));
  } catch (err) {
    console.error(`Error reading history D1 for ${doorKey}:`, err);
    return [];
  }
}

export async function getLatestEmailAtForDoor(env: Env, doorKey: string): Promise<string | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT MAX(occurred_at) AS last_email_at
       FROM door_events
       WHERE door_id = ? AND source = 'email'`,
    )
      .bind(doorKey)
      .first<{ last_email_at: string | null }>();
    return row?.last_email_at ?? null;
  } catch (err) {
    console.error(`Error reading last email for ${doorKey}:`, err);
    return null;
  }
}

export async function getAlertLatch(env: Env, doorKey: string): Promise<AlertLatch | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT open_since, last_alert_sent_at FROM alert_state WHERE door_id = ?`,
    )
      .bind(doorKey)
      .first<{ open_since: string; last_alert_sent_at: string | null }>();

    if (!row || !row.last_alert_sent_at) return null;
    return {
      openCreatedAt: row.open_since,
      lastAlertSentAt: row.last_alert_sent_at,
    };
  } catch {
    return null;
  }
}

export async function setAlertLatch(env: Env, doorKey: string, latch: AlertLatch): Promise<void> {
  await ensureDoor(env, doorKey);
  await env.GARAGE_DB.prepare(
    `INSERT INTO alert_state (door_id, open_since, last_alert_sent_at)
     VALUES (?, ?, ?)
     ON CONFLICT(door_id) DO UPDATE SET
       open_since = excluded.open_since,
       last_alert_sent_at = excluded.last_alert_sent_at`,
  )
    .bind(doorKey, latch.openCreatedAt, latch.lastAlertSentAt)
    .run();
}

/** Delete door_events older than retention window. Returns rows deleted. */
export async function pruneOldEvents(env: Env, nowMs = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.GARAGE_DB.prepare(`DELETE FROM door_events WHERE occurred_at < ?`)
    .bind(cutoff)
    .run();
  return result.meta.changes ?? 0;
}
