/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHealth } from '../src/health';
import { recordOpsEvent } from '../src/ops';
import { createMockD1 } from './mock-d1';

describe('buildHealth', () => {
  let mockDb: any;
  let state: any;

  beforeEach(() => {
    ({ mockDb, state } = createMockD1());
  });

  it('returns non-secret diagnostics and D1 ping', async () => {
    await recordOpsEvent({ GARAGE_DB: mockDb } as any, 'email_ok', {
      detail: 'Garage Door Left → CLOSED',
      at: '2026-07-27T10:00:00.000Z',
    });
    await recordOpsEvent({ GARAGE_DB: mockDb } as any, 'email_reject', {
      detail: 'unsupported_sender',
      at: '2026-07-27T09:00:00.000Z',
    });

    const health = await buildHealth(
      {
        GARAGE_DB: mockDb,
        ASSETS: { fetch: vi.fn() } as any,
        GARAGE_DOORS: { Left: 'left', Right: 'right' },
        VERSION: '1.1.0',
        API_KEY: 'secret',
        ALLOWED_EMAIL_TO: 'garage@example.com',
        STALE_AFTER_HOURS: '24',
      },
      Date.parse('2026-07-27T12:00:00.000Z'),
    );

    expect(health.version).toBe('1.1.0');
    expect(health.doorCount).toBe(2);
    expect(health.hasApiKey).toBe(true);
    expect(health.hasAllowedEmailTo).toBe(true);
    expect(health.d1Ok).toBe(true);
    expect(health.staleAfterHours).toBe(24);
    expect(health.historyRetentionDays).toBe(90);
    expect(health.opsRetentionDays).toBe(30);
    expect(health.lastEmailOk).toEqual({
      occurredAt: '2026-07-27T10:00:00.000Z',
      detail: 'Garage Door Left → CLOSED',
    });
    expect(health.lastEmailReject?.detail).toBe('unsupported_sender');
    expect(JSON.stringify(health)).not.toContain('secret');
    expect(JSON.stringify(health)).not.toContain('garage@example.com');
    expect(state.ops_events).toHaveLength(2);
  });
});
