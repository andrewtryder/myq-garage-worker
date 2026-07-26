/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOpenDoorAlerts, sendWebhook, testAlert } from '../src/alerts';
import { AlertConfig } from '../src/alert-config';
import { createMockKv } from './mock-kv';

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
    const { mockKV } = createMockKv();
    const results = await runOpenDoorAlerts({ GARAGE_STATE: mockKV } as any);
    expect(results).toEqual([
      { door: '', sent: false, skippedReason: 'Alert webhook not configured' },
    ]);
  });

  it('sends alert when door has been open past threshold', async () => {
    const { mockKV } = createMockKv(
      new Map([
        [
          'garage-left',
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
      ]),
    );

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

  it('does not re-send on subsequent runs for the same open session', async () => {
    const { store, mockKV } = createMockKv(
      new Map([
        [
          'garage-left',
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
      ]),
    );

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
    };

    const first = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });
    expect(first[0].sent).toBe(true);

    const second = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:15:00.000Z'),
    });
    expect(second[0].sent).toBe(false);
    expect(second[0].skippedReason).toContain('already sent');
    expect(store.has('alert-latch:garage-left')).toBe(true);
  });

  it('sends a reminder after reminderMinutes', async () => {
    const { mockKV } = createMockKv(
      new Map([
        [
          'garage-left',
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
        [
          'alert-latch:garage-left',
          JSON.stringify({
            openCreatedAt: '2020-01-01T00:00:00.000Z',
            lastAlertSentAt: '2025-01-01T11:00:00.000Z',
          }),
        ],
      ]),
    );

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
    };

    const results = await runOpenDoorAlerts(env, {
      config: { ...sampleConfig, reminderMinutes: 30 },
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(results[0].sent).toBe(true);
  });

  it('skips alert when door has not been open long enough', async () => {
    const { mockKV } = createMockKv(
      new Map([
        [
          'garage-left',
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2025-01-01T11:30:00.000Z',
          }),
        ],
      ]),
    );

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

  it('sends GET webhook with query params and redirect:manual', async () => {
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
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    );
  });

  it('testAlert sends immediately without requiring an open door', async () => {
    const result = await testAlert(sampleConfig, 'Garage Door Left');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(true);
    expect(result.payload?.door).toBe('Garage Door Left');
  });

  it('returns a generic error instead of raw fetch exceptions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND evil.internal'))),
    );

    const result = await testAlert(sampleConfig, 'Garage Door Left');
    expect(result.sent).toBe(false);
    expect(result.error).toBe('Webhook request failed');
    expect(result.error).not.toContain('ENOTFOUND');
  });

  it('treats HTTP redirects as blocked when redirect is manual', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 302,
        }),
      ),
    );

    const result = await testAlert(sampleConfig, 'Garage Door Left');
    expect(result.sent).toBe(false);
    expect(result.skippedReason).toContain('redirects are not allowed');
  });

  it('sends again after close then reopen clears the latch', async () => {
    const { store, mockKV } = createMockKv(
      new Map([
        [
          'garage-left',
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
        [
          'alert-latch:garage-left',
          JSON.stringify({
            openCreatedAt: '2020-01-01T00:00:00.000Z',
            lastAlertSentAt: '2025-01-01T11:00:00.000Z',
          }),
        ],
      ]),
    );

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
    };

    const skipped = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });
    expect(skipped[0].sent).toBe(false);

    // Simulate door close clearing latch (storage.saveDoorState behavior)
    store.delete('alert-latch:garage-left');
    store.set(
      'garage-left',
      JSON.stringify({
        value: 'OPEN',
        createdAt: '2025-01-01T12:30:00.000Z',
      }),
    );

    const afterReopen = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T14:00:00.000Z'),
    });
    expect(afterReopen[0].sent).toBe(true);
  });

  it('reports webhook success even when latch persistence fails', async () => {
    const { mockKV } = createMockKv(
      new Map([
        [
          'garage-left',
          JSON.stringify({
            value: 'OPEN',
            createdAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
      ]),
    );
    mockKV.put.mockImplementation((key: string, _value: string) => {
      if (key.startsWith('alert-latch:')) {
        return Promise.reject(new Error('kv write failed'));
      }
      return Promise.resolve();
    });

    const env: any = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
    };

    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(results).toHaveLength(1);
    expect(results[0].sent).toBe(true);
    expect(results[0].error).toBeUndefined();
  });
});
