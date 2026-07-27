/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDashboard, isStaleAt } from '../src/dashboard';
import { createMockD1 } from './mock-d1';

describe('isStaleAt', () => {
  it('treats missing or invalid timestamps as stale', () => {
    const now = Date.parse('2026-07-27T12:00:00.000Z');
    expect(isStaleAt(null, now, 48)).toBe(true);
    expect(isStaleAt('not-a-date', now, 48)).toBe(true);
  });

  it('uses STALE_AFTER_HOURS window', () => {
    const now = Date.parse('2026-07-27T12:00:00.000Z');
    expect(isStaleAt('2026-07-26T12:00:00.000Z', now, 48)).toBe(false);
    expect(isStaleAt('2026-07-24T11:00:00.000Z', now, 48)).toBe(true);
  });
});

describe('buildDashboard', () => {
  let mockDb: any;
  let state: any;

  beforeEach(() => {
    ({ mockDb, state } = createMockD1());
  });

  it('returns stable dashboard shape with stale fields from D1 door state', async () => {
    const now = Date.parse('2026-07-26T21:30:00.000Z');
    state.doors.set('garage-left', {
      id: 'garage-left',
      name: 'Garage Door Left',
      current_status: 'CLOSED',
      state_since: '2026-07-26T19:10:00.000Z',
      updated_at: '2026-07-26T19:10:00.000Z',
    });
    state.door_events.push({
      id: 1,
      door_id: 'garage-left',
      status: 'CLOSED',
      occurred_at: '2026-07-26T19:10:00.000Z',
      message_id_hash: null,
      source: 'email',
    });

    const result = await buildDashboard(
      {
        GARAGE_DB: mockDb,
        ASSETS: { fetch: vi.fn() } as any,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        STALE_AFTER_HOURS: '48',
      },
      now,
    );

    expect(result.generatedAt).toBe('2026-07-26T21:30:00.000Z');
    expect(result.stale).toBe(false);
    expect(result.healthy).toBe(true);
    expect(result.openCount).toBe(0);
    expect(result.lastEventAt).toBe('2026-07-26T19:10:00.000Z');
    expect(result.staleAfterHours).toBe(48);
    expect(result.doors).toEqual([
      {
        id: 'garage-left',
        name: 'Garage Door Left',
        status: 'CLOSED',
        stateSince: '2026-07-26T19:10:00.000Z',
        durationSeconds: 8400,
        durationText: '2 hrs 20 mins',
        lastEventAt: '2026-07-26T19:10:00.000Z',
        stale: false,
      },
    ]);
    expect(result.recentEvents).toEqual([
      {
        doorId: 'garage-left',
        doorName: 'Garage Door Left',
        status: 'CLOSED',
        createdAt: '2026-07-26T19:10:00.000Z',
      },
    ]);
  });
});
