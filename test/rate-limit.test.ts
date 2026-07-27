/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { consumeRateLimit } from '../src/rate-limit';
import { createMockD1 } from './mock-d1';

describe('consumeRateLimit', () => {
  let mockDb: any;

  beforeEach(() => {
    ({ mockDb } = createMockD1());
  });

  it('allows requests under the limit and tracks remaining', async () => {
    const env: any = { GARAGE_DB: mockDb };
    const first = await consumeRateLimit(env, 'alert-config', 2);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await consumeRateLimit(env, 'alert-config', 2);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = await consumeRateLimit(env, 'alert-config', 2);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('fails open when D1 throws', async () => {
    mockDb.prepare.mockImplementation(() => {
      throw new Error('d1 down');
    });
    const env: any = { GARAGE_DB: mockDb };
    const result = await consumeRateLimit(env, 'test-alert', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});
