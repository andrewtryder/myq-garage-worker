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

  it('marks healthy only when every door has fresh email activity', async () => {
    const now = Date.parse('2026-07-26T21:30:00.000Z');
    state.doors.set('garage-left', {
      id: 'garage-left',
      name: 'Garage Door Left',
      current_status: 'CLOSED',
      state_since: '2026-07-26T19:10:00.000Z',
      updated_at: '2026-07-26T19:10:00.000Z',
    });
    state.doors.set('garage-right', {
      id: 'garage-right',
      name: 'Garage Door Right',
      current_status: 'CLOSED',
      state_since: '2026-07-10T19:10:00.000Z',
      updated_at: '2026-07-10T19:10:00.000Z',
    });
    state.door_events.push({
      id: 1,
      door_id: 'garage-left',
      status: 'CLOSED',
      occurred_at: '2026-07-26T19:10:00.000Z',
      message_id_hash: null,
      source: 'email',
    });
    state.door_events.push({
      id: 2,
      door_id: 'garage-right',
      status: 'CLOSED',
      occurred_at: '2026-07-10T19:10:00.000Z',
      message_id_hash: null,
      source: 'email',
    });
    // Simulate must not refresh email pipeline freshness
    state.door_events.push({
      id: 3,
      door_id: 'garage-right',
      status: 'CLOSED',
      occurred_at: '2026-07-26T21:00:00.000Z',
      message_id_hash: null,
      source: 'simulate',
    });

    const result = await buildDashboard(
      {
        GARAGE_DB: mockDb,
        ASSETS: { fetch: vi.fn() } as any,
        GARAGE_DOORS: {
          'Garage Door Left': 'garage-left',
          'Garage Door Right': 'garage-right',
        },
        STALE_AFTER_HOURS: '48',
      },
      now,
    );

    expect(result.lastEmailReceivedAt).toBe('2026-07-26T19:10:00.000Z');
    expect(result.lastStateChangeAt).toBe('2026-07-26T21:00:00.000Z');
    expect(result.stale).toBe(true);
    expect(result.emailPipelineStale).toBe(true);
    expect(result.healthy).toBe(false);
    expect(result.doors.find((door) => door.id === 'garage-left')?.stale).toBe(false);
    expect(result.doors.find((door) => door.id === 'garage-right')?.stale).toBe(true);
  });

  it('returns stable dashboard shape with email stale fields', async () => {
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
    expect(result.lastEmailReceivedAt).toBe('2026-07-26T19:10:00.000Z');
    expect(result.doors[0]).toMatchObject({
      id: 'garage-left',
      status: 'CLOSED',
      lastEmailAt: '2026-07-26T19:10:00.000Z',
      stale: false,
    });
  });
});
