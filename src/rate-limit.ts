import { Env } from './types';

const WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 20;

export async function consumeRateLimit(
  env: Env,
  bucket: string,
  limit = DEFAULT_LIMIT,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowId = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `ratelimit:${bucket}:${windowId}`;

  try {
    const raw = await env.GARAGE_STATE.get(key);
    const current = raw ? parseInt(raw, 10) : 0;
    const count = Number.isFinite(current) ? current : 0;

    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    await env.GARAGE_STATE.put(key, String(count + 1), {
      expirationTtl: WINDOW_SECONDS * 2,
    });
    return { allowed: true, remaining: Math.max(0, limit - count - 1) };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    // Fail open on KV errors so alerts/config are not bricked.
    return { allowed: true, remaining: limit };
  }
}
