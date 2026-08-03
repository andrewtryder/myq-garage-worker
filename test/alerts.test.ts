/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOpenDoorAlerts, sendWebhook, testAlert } from '../src/alerts';
import { AlertConfig } from '../src/alert-config';
import { DEFAULT_WEBHOOK_ARGUMENTS } from '../src/webhook-payload';
import { createMockD1 } from './mock-d1';

const sampleConfig: AlertConfig = {
  webhookUrl: 'https://example.com/webhook',
  method: 'POST',
  contentType: 'application/json',
  arguments: DEFAULT_WEBHOOK_ARGUMENTS,
};

function envWithOpenDoor(
  createdAt: string,
  extraState?: (state: any) => void,
  alertsEnabled = true,
): { env: any; state: any; mockDb: any } {
  const { mockDb, state } = createMockD1();
  state.doors.set('garage-left', {
    id: 'garage-left',
    name: 'Garage Door Left',
    current_status: 'OPEN',
    state_since: createdAt,
    updated_at: createdAt,
    alerts_enabled: alertsEnabled ? 1 : 0,
    notify_after_minutes: 60,
    reminder_interval_minutes: null,
  });
  extraState?.(state);
  return {
    mockDb,
    state,
    env: {
      GARAGE_DB: mockDb,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
    },
  };
}

describe('alerts', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: async () => 'ok',
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns not configured when alert config is missing', async () => {
    const { mockDb } = createMockD1();
    const results = await runOpenDoorAlerts({ GARAGE_DB: mockDb } as any);
    expect(results).toEqual([
      { door: '', sent: false, skippedReason: 'Alert webhook not configured' },
    ]);
  });

  it('skips doors with alerts disabled', async () => {
    const { env } = envWithOpenDoor('2020-01-01T00:00:00.000Z', undefined, false);
    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(results[0].skippedReason).toContain('disabled');
  });

  it('sends alert when door has been open past per-door threshold', async () => {
    const { env } = envWithOpenDoor('2020-01-01T00:00:00.000Z');
    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0].sent).toBe(true);
    expect(results[0].payload?.door).toBe('Garage Door Left');
  });

  it('does not re-send on subsequent runs for the same open session', async () => {
    const { env, state } = envWithOpenDoor('2020-01-01T00:00:00.000Z');

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
    expect(state.alert_state.has('garage-left')).toBe(true);
  });

  it('sends a reminder after per-door reminder interval', async () => {
    const { env } = envWithOpenDoor('2020-01-01T00:00:00.000Z', (state) => {
      state.doors.get('garage-left')!.reminder_interval_minutes = 30;
      state.alert_state.set('garage-left', {
        door_id: 'garage-left',
        open_since: '2020-01-01T00:00:00.000Z',
        last_alert_sent_at: '2025-01-01T11:00:00.000Z',
      });
    });

    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(results[0].sent).toBe(true);
  });

  it('skips alert when door has not been open long enough', async () => {
    const { env } = envWithOpenDoor('2025-01-01T11:30:00.000Z');
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
      {
        webhookUrl: 'https://ntfy.sh/topic',
        method: 'GET',
        contentType: 'application/json',
        arguments: [
          { key: 'door', value: '{{door}}' },
          { key: 'state', value: '{{state}}' },
        ],
      },
      {
        title: 'Garage Door Alert',
        message: 'Door open',
        door: 'Garage Door Left',
        state: 'OPEN',
        durationMs: 1000,
        durationText: '1 min',
        timestamp: '2025-01-01T12:00:00.000Z',
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
    expect(result.responseBody).toBe('ok');
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
          text: async () => '',
        }),
      ),
    );

    const result = await testAlert(sampleConfig, 'Garage Door Left');
    expect(result.sent).toBe(false);
    expect(result.skippedReason).toContain('redirects are not allowed');
  });

  it('sends again after close then reopen clears the latch', async () => {
    const { env, state } = envWithOpenDoor('2020-01-01T00:00:00.000Z', (s) => {
      s.alert_state.set('garage-left', {
        door_id: 'garage-left',
        open_since: '2020-01-01T00:00:00.000Z',
        last_alert_sent_at: '2025-01-01T11:00:00.000Z',
      });
    });

    const skipped = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });
    expect(skipped[0].sent).toBe(false);

    state.alert_state.delete('garage-left');
    state.doors.set('garage-left', {
      id: 'garage-left',
      name: 'Garage Door Left',
      current_status: 'OPEN',
      state_since: '2025-01-01T12:30:00.000Z',
      updated_at: '2025-01-01T12:30:00.000Z',
      alerts_enabled: 1,
      notify_after_minutes: 60,
      reminder_interval_minutes: null,
    });

    const afterReopen = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T14:00:00.000Z'),
    });
    expect(afterReopen[0].sent).toBe(true);
  });

  it('reports webhook success even when latch persistence fails', async () => {
    const { env, mockDb } = envWithOpenDoor('2020-01-01T00:00:00.000Z');
    const originalPrepare = mockDb.prepare.getMockImplementation();
    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO alert_state')) {
        return {
          bind: () => ({
            run: async () => {
              throw new Error('d1 write failed');
            },
          }),
        };
      }
      return originalPrepare(sql);
    });

    const results = await runOpenDoorAlerts(env, {
      config: sampleConfig,
      nowMs: Date.parse('2025-01-01T12:00:00.000Z'),
    });

    expect(results).toHaveLength(1);
    expect(results[0].sent).toBe(true);
    expect(results[0].error).toBeUndefined();
  });
});
