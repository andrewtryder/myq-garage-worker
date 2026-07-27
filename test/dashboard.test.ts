/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDashboard } from '../src/dashboard';
import { createMockD1 } from './mock-d1';

describe('buildDashboard', () => {
  let mockDb: any;
  let state: any;

  beforeEach(() => {
    ({ mockDb, state } = createMockD1());
  });

  it('returns stable dashboard shape from D1 door state', async () => {
    const now = Date.parse('2026-07-26T21:30:00.000Z');
    state.doors.set('garage-left', {
      id: 'garage-left',
      name: 'Garage Door Left',
      current_status: 'CLOSED',
      state_since: '2026-07-26T19:10:00.000Z',
      updated_at: '2026-07-26T19:10:00.000Z',
    });

    const result = await buildDashboard(
      {
        GARAGE_DB: mockDb,
        ASSETS: { fetch: vi.fn() } as any,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      },
      now,
    );

    expect(result.generatedAt).toBe('2026-07-26T21:30:00.000Z');
    expect(result.doors).toEqual([
      {
        id: 'garage-left',
        name: 'Garage Door Left',
        status: 'CLOSED',
        stateSince: '2026-07-26T19:10:00.000Z',
        durationSeconds: 8400,
        durationText: '2 hrs 20 mins',
      },
    ]);
    expect(result.recentEvents).toEqual([]);
  });
});
