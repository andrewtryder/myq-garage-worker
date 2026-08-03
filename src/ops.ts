import { Env } from './types';

export type OpsEventKind =
  'email_ok' | 'email_reject' | 'door_change' | 'cron_alerts' | 'webhook_ok' | 'webhook_fail';

export const OPS_RETENTION_DAYS = 30;

export async function recordOpsEvent(
  env: Env,
  kind: OpsEventKind,
  options: { doorId?: string | null; detail?: string | null; at?: string } = {},
): Promise<void> {
  try {
    const occurredAt = options.at ?? new Date().toISOString();
    const detail = options.detail ? options.detail.slice(0, 240) : null;
    await env.GARAGE_DB.prepare(
      `INSERT INTO ops_events (occurred_at, kind, door_id, detail) VALUES (?, ?, ?, ?)`,
    )
      .bind(occurredAt, kind, options.doorId ?? null, detail)
      .run();
  } catch (err) {
    console.error('Failed to record ops event:', err);
  }
}

export async function getLatestOpsEvent(
  env: Env,
  kind: OpsEventKind,
): Promise<{ occurredAt: string; doorId: string | null; detail: string | null } | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT occurred_at, door_id, detail
       FROM ops_events
       WHERE kind = ?
       ORDER BY occurred_at DESC
       LIMIT 1`,
    )
      .bind(kind)
      .first<{ occurred_at: string; door_id: string | null; detail: string | null }>();

    if (!row) return null;
    return {
      occurredAt: row.occurred_at,
      doorId: row.door_id,
      detail: row.detail,
    };
  } catch {
    return null;
  }
}

export async function pruneOpsEvents(env: Env, nowMs = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - OPS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = await env.GARAGE_DB.prepare(`DELETE FROM ops_events WHERE occurred_at < ?`)
      .bind(cutoff)
      .run();
    return result.meta.changes ?? 0;
  } catch (err) {
    console.error('Failed to prune ops events:', err);
    return 0;
  }
}
