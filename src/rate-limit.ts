import { Env } from './types';

const WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 20;

export async function consumeRateLimit(
  env: Env,
  bucket: string,
  limit = DEFAULT_LIMIT,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowId = String(Math.floor(Date.now() / (WINDOW_SECONDS * 1000)));

  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT count FROM rate_limits WHERE bucket = ? AND window_id = ?`,
    )
      .bind(bucket, windowId)
      .first<{ count: number }>();

    const count = row?.count ?? 0;
    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    await env.GARAGE_DB.prepare(
      `INSERT INTO rate_limits (bucket, window_id, count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket, window_id) DO UPDATE SET count = count + 1`,
    )
      .bind(bucket, windowId)
      .run();

    return { allowed: true, remaining: Math.max(0, limit - count - 1) };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    return { allowed: true, remaining: limit };
  }
}
