/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOpenDoorAlerts, sendWebhook, testAlert } from '../src/alerts';
import { AlertConfig } from '../src/alert-config';

const sampleConfig: AlertConfig = {
  webhookUrl: 'https://example.com/webhook',
  thresholdMinutes: 60,
  method: 'POST',
};

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

  it('returns not configured when alert config is missing', async () => {
    const mockKV = {
      get: vi.fn(() => Promise.resolve(null)),
    };

    const results = await runOpenDoorAlerts({ GARAGE_STATE: mockKV } as any);
    expect(results).toEqual([
      { door: '', sent: false, skippedReason: 'Alert webhook not configured' },
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
    };

    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

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
    };

    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(results[0].sent).toBe(false);
    expect(results[0].skippedReason).toContain('threshold 60 min');
  });

  it('sends GET webhook with query params', async () => {
    await sendWebhook(
      { webhookUrl: 'https://ntfy.sh/topic', thresholdMinutes: 60, method: 'GET' },
      {
        title: 'Garage Door Alert',
        message: 'Door open',
        door: 'Garage Door Left',
        state: 'OPEN',
        durationMs: 1000,
        durationText: '1 min',
      },
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://ntfy.sh/topic?'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('testAlert sends immediately without requiring an open door', async () => {
    const result = await testAlert(sampleConfig, 'Garage Door Left');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(true);
    expect(result.payload?.door).toBe('Garage Door Left');
  });
});
