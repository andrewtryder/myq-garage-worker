/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import {
  validateAlertConfig,
  getAlertConfig,
  saveAlertConfig,
  resolveAlertConfigFromBody,
  toPublicAlertConfig,
  updateDoorAlertSettings,
  listDoorAlertSettings,
} from '../src/alert-config';
import { DEFAULT_WEBHOOK_ARGUMENTS } from '../src/webhook-payload';
import { createMockD1 } from './mock-d1';

describe('alert-config', () => {
  it('validates a complete alert config', () => {
    expect(
      validateAlertConfig({
        webhookUrl: 'https://ntfy.sh/my-topic',
        method: 'GET',
        contentType: 'application/json',
        arguments: [{ key: 'door', value: '{{door}}' }],
      }),
    ).toEqual({
      webhookUrl: 'https://ntfy.sh/my-topic',
      method: 'GET',
      contentType: 'application/json',
      arguments: [{ key: 'door', value: '{{door}}' }],
    });
  });

  it('rejects invalid webhook URLs and content types', () => {
    expect(validateAlertConfig({ webhookUrl: '', method: 'POST' })).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'http://example.com',
        method: 'POST',
      }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'https://127.0.0.1/hook',
        method: 'POST',
      }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com',
        method: 'POST',
        contentType: 'text/xml',
      }),
    ).toBeNull();
  });

  it('reads and writes config in D1', async () => {
    const { mockDb } = createMockD1();
    const env: any = { GARAGE_DB: mockDb };

    expect(await getAlertConfig(env)).toBeNull();

    await saveAlertConfig(env, {
      webhookUrl: 'https://example.com/webhook',
      method: 'POST',
      contentType: 'application/json',
      arguments: DEFAULT_WEBHOOK_ARGUMENTS,
    });

    const loaded = await getAlertConfig(env);
    expect(loaded).toMatchObject({
      webhookUrl: 'https://example.com/webhook',
      method: 'POST',
      contentType: 'application/json',
    });
    expect(loaded?.arguments.length).toBeGreaterThan(0);
  });

  it('resolves request body over saved config and keeps saved URL when omitted', () => {
    const saved = {
      webhookUrl: 'https://saved.example/webhook',
      method: 'POST' as const,
      contentType: 'application/json' as const,
      arguments: DEFAULT_WEBHOOK_ARGUMENTS,
    };

    expect(
      resolveAlertConfigFromBody({ webhookUrl: 'https://test.example/hook', method: 'GET' }, saved),
    ).toMatchObject({
      webhookUrl: 'https://test.example/hook',
      method: 'GET',
    });

    expect(resolveAlertConfigFromBody({ method: 'POST' }, saved)).toMatchObject({
      webhookUrl: 'https://saved.example/webhook',
      method: 'POST',
    });
  });

  it('rejects invalid argument lists', () => {
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com/hook',
        method: 'POST',
        arguments: [{ key: '', value: 'x' }],
      }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com/hook',
        method: 'POST',
        arguments: 'not-json',
      }),
    ).toBeNull();
  });

  it('throws when saving invalid alert config', async () => {
    const { mockDb } = createMockD1();
    const env: any = { GARAGE_DB: mockDb };
    await expect(saveAlertConfig(env, { webhookUrl: 'http://bad' })).rejects.toThrow(
      /Invalid alert configuration/,
    );
  });

  it('returns null from toPublicAlertConfig when config is missing', () => {
    expect(toPublicAlertConfig(null)).toBeNull();
  });

  it('updates per-door alert settings', async () => {
    const { mockDb, state } = createMockD1();
    state.doors.set('garage-left', {
      id: 'garage-left',
      name: 'Garage Door Left',
      current_status: 'CLOSED',
      state_since: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      alerts_enabled: 0,
      notify_after_minutes: 30,
      reminder_interval_minutes: null,
    });
    const env: any = {
      GARAGE_DB: mockDb,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
    };

    const updated = await updateDoorAlertSettings(env, 'garage-left', {
      alertsEnabled: true,
      notifyAfterMinutes: 10,
      reminderIntervalMinutes: 15,
    });
    expect(updated).toMatchObject({
      doorId: 'garage-left',
      alertsEnabled: true,
      notifyAfterMinutes: 10,
      reminderIntervalMinutes: 15,
    });

    const listed = await listDoorAlertSettings(env);
    expect(listed[0].alertsEnabled).toBe(true);
    expect(listed[0].notifyAfterMinutes).toBe(10);
  });
});
