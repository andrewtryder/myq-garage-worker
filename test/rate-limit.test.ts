/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { consumeRateLimit } from '../src/rate-limit';
import { createMockKv } from './mock-kv';

describe('consumeRateLimit', () => {
  let mockKV: any;
  let store: Map<string, string>;

  beforeEach(() => {
    ({ store, mockKV } = createMockKv());
  });

  it('allows requests under the limit and tracks remaining', async () => {
    const env: any = { GARAGE_STATE: mockKV };
    const first = await consumeRateLimit(env, 'alert-config', 2);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await consumeRateLimit(env, 'alert-config', 2);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = await consumeRateLimit(env, 'alert-config', 2);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect([...store.keys()].some((key) => key.startsWith('ratelimit:alert-config:'))).toBe(true);
  });

  it('fails open when KV throws', async () => {
    mockKV.get.mockRejectedValue(new Error('kv down'));
    const env: any = { GARAGE_STATE: mockKV };
    const result = await consumeRateLimit(env, 'test-alert', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});
