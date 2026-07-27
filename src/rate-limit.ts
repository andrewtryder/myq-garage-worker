import { Env } from './types';

const WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 20;
/** Keep a few prior windows for debugging; prune older on cron. */
const RATE_LIMIT_WINDOW_RETENTION = 3;

export async function consumeRateLimit(
  env: Env,
  bucket: string,
  limit = DEFAULT_LIMIT,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowId = String(Math.floor(Date.now() / (WINDOW_SECONDS * 1000)));

  try {
    const row = await env.GARAGE_DB.prepare(
      `INSERT INTO rate_limits (bucket, window_id, count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket, window_id)
       DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(bucket, windowId)
      .first<{ count: number }>();

    const count = row?.count ?? limit + 1;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
    };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    return { allowed: true, remaining: limit };
  }
}

export async function pruneRateLimits(env: Env, nowMs = Date.now()): Promise<number> {
  const currentWindow = Math.floor(nowMs / (WINDOW_SECONDS * 1000));
  const cutoff = currentWindow - RATE_LIMIT_WINDOW_RETENTION;
  try {
    const result = await env.GARAGE_DB.prepare(
      `DELETE FROM rate_limits WHERE CAST(window_id AS INTEGER) < ?`,
    )
      .bind(cutoff)
      .run();
    return result.meta.changes ?? 0;
  } catch (err) {
    console.error('Failed to prune rate limits:', err);
    return 0;
  }
}
