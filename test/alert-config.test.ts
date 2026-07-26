/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import {
  validateAlertConfig,
  getAlertConfig,
  saveAlertConfig,
  resolveAlertConfigFromBody,
  toPublicAlertConfig,
} from '../src/alert-config';
import { createMockKv } from './mock-kv';

describe('alert-config', () => {
  it('validates a complete alert config', () => {
    expect(
      validateAlertConfig({
        webhookUrl: 'https://ntfy.sh/my-topic',
        thresholdMinutes: 30,
        method: 'GET',
      }),
    ).toEqual({
      webhookUrl: 'https://ntfy.sh/my-topic',
      thresholdMinutes: 30,
      method: 'GET',
    });
  });

  it('rejects invalid webhook URLs and thresholds', () => {
    expect(
      validateAlertConfig({ webhookUrl: '', thresholdMinutes: 60, method: 'POST' }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'http://example.com',
        thresholdMinutes: 60,
        method: 'POST',
      }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'https://127.0.0.1/hook',
        thresholdMinutes: 60,
        method: 'POST',
      }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com',
        thresholdMinutes: 0,
        method: 'POST',
      }),
    ).toBeNull();
  });

  it('reads and writes config in KV', async () => {
    const { mockKV } = createMockKv();
    const env: any = { GARAGE_STATE: mockKV };

    expect(await getAlertConfig(env)).toBeNull();

    await saveAlertConfig(env, {
      webhookUrl: 'https://example.com/webhook',
      thresholdMinutes: 45,
      method: 'POST',
    });

    expect(await getAlertConfig(env)).toEqual({
      webhookUrl: 'https://example.com/webhook',
      thresholdMinutes: 45,
      method: 'POST',
    });
  });

  it('resolves request body over saved config and keeps saved URL when omitted', () => {
    const saved = {
      webhookUrl: 'https://saved.example/webhook',
      thresholdMinutes: 60,
      method: 'POST' as const,
    };

    expect(
      resolveAlertConfigFromBody({ webhookUrl: 'https://test.example/hook', method: 'GET' }, saved),
    ).toEqual({
      webhookUrl: 'https://test.example/hook',
      thresholdMinutes: 60,
      method: 'GET',
    });

    expect(resolveAlertConfigFromBody({ thresholdMinutes: 90, method: 'POST' }, saved)).toEqual({
      webhookUrl: 'https://saved.example/webhook',
      thresholdMinutes: 90,
      method: 'POST',
    });
  });

  it('rejects invalid reminderMinutes and accepts string threshold/reminder', () => {
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com/hook',
        thresholdMinutes: '30',
        method: 'POST',
        reminderMinutes: 'abc',
      }),
    ).toBeNull();
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com/hook',
        thresholdMinutes: '45',
        method: 'POST',
        reminderMinutes: '0',
      }),
    ).toEqual({
      webhookUrl: 'https://example.com/hook',
      thresholdMinutes: 45,
      method: 'POST',
    });
    expect(
      validateAlertConfig({
        webhookUrl: 'https://example.com/hook',
        thresholdMinutes: 60,
        method: 'POST',
        reminderMinutes: 15,
      }),
    ).toMatchObject({ reminderMinutes: 15 });
  });

  it('returns null from getAlertConfig on malformed KV JSON', async () => {
    const { mockKV } = createMockKv(new Map([['config:alerts', '{not-json']]));
    const env: any = { GARAGE_STATE: mockKV };
    expect(await getAlertConfig(env)).toBeNull();
  });

  it('throws when saving invalid alert config', async () => {
    const { mockKV } = createMockKv();
    const env: any = { GARAGE_STATE: mockKV };
    await expect(saveAlertConfig(env, { webhookUrl: 'http://bad' })).rejects.toThrow(
      /Invalid alert configuration/,
    );
  });

  it('returns null from toPublicAlertConfig when config is missing', () => {
    expect(toPublicAlertConfig(null)).toBeNull();
  });
});
