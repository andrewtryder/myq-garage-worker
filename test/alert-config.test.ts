/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  validateAlertConfig,
  getAlertConfig,
  saveAlertConfig,
  resolveAlertConfigFromBody,
} from '../src/alert-config';

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
      validateAlertConfig({ webhookUrl: 'ftp://bad', thresholdMinutes: 60, method: 'POST' }),
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
    const store = new Map<string, string>();
    const env: any = {
      GARAGE_STATE: {
        get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        put: vi.fn((key: string, value: string) => {
          store.set(key, value);
          return Promise.resolve();
        }),
      },
    };

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

  it('resolves request body over saved config', () => {
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
  });
});
