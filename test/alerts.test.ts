/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAlertThresholdMinutes, runOpenDoorAlerts } from '../src/alerts';

describe('alerts', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns not configured when WEBHOOK_URL is missing', async () => {
    const results = await runOpenDoorAlerts({} as any);
    expect(results).toEqual([
      { door: '', sent: false, skippedReason: 'WEBHOOK_URL not configured' },
    ]);
  });

  it('sends alert when door has been open past threshold', async () => {
    const mockKV = {
      get: vi.fn((key: string) => {
        if (key === 'garage-left') {
          return Promise.resolve(
            JSON.stringify({
              value: 'OPEN',
              createdAt: '2020-01-01T00:00:00.000Z',
            }),
          );
        }
        return Promise.resolve(null);
      }),
    };

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      WEBHOOK_URL: 'https://example.com/webhook',
      ALERT_OPEN_THRESHOLD_MINUTES: '60',
    };

    const results = await runOpenDoorAlerts(env, { nowMs: Date.parse('2025-01-01T12:00:00.000Z') });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0].sent).toBe(true);
    expect(results[0].payload?.door).toBe('Garage Door Left');
  });

  it('skips alert when door has not been open long enough', async () => {
    const mockKV = {
      get: vi.fn(() =>
        Promise.resolve(
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2025-01-01T11:30:00.000Z',
          }),
        ),
      ),
    };

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      WEBHOOK_URL: 'https://example.com/webhook',
      ALERT_OPEN_THRESHOLD_MINUTES: '60',
    };

    const results = await runOpenDoorAlerts(env, { nowMs: Date.parse('2025-01-01T12:00:00.000Z') });

    expect(fetch).not.toHaveBeenCalled();
    expect(results[0].sent).toBe(false);
    expect(results[0].skippedReason).toContain('threshold 60 min');
  });

  it('force mode sends alert even when under threshold', async () => {
    const mockKV = {
      get: vi.fn(() =>
        Promise.resolve(
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2025-01-01T11:59:00.000Z',
          }),
        ),
      ),
    };

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      WEBHOOK_URL: 'https://example.com/webhook',
      ALERT_OPEN_THRESHOLD_MINUTES: '60',
    };

    const results = await runOpenDoorAlerts(env, {
      forceDoorName: 'Garage Door Left',
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0].sent).toBe(true);
  });

  it('defaults alert threshold to 60 minutes', () => {
    expect(getAlertThresholdMinutes({} as any)).toBe(60);
  });
});
