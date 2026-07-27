/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDashboard } from '../src/dashboard';
import { createMockKv } from './mock-kv';

describe('buildDashboard', () => {
  let mockKV: any;

  beforeEach(() => {
    ({ mockKV } = createMockKv());
  });

  it('returns stable dashboard shape from KV door state', async () => {
    const now = Date.parse('2026-07-26T21:30:00.000Z');
    await mockKV.put(
      'garage-left',
      JSON.stringify({ value: 'CLOSED', createdAt: '2026-07-26T19:10:00.000Z' }),
    );

    const result = await buildDashboard(
      {
        GARAGE_STATE: mockKV,
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
