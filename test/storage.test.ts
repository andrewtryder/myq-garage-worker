/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDoorState,
  getDoorState,
  getDoorHistory,
  beginMessageProcessing,
  completeMessageProcessing,
  abortMessageProcessing,
} from '../src/storage';
import { Env } from '../src/types';
import { createMockKv } from './mock-kv';

describe('storage KV tests', () => {
  let mockKV: any;
  let store: Map<string, string>;
  let mockEnv: Env;

  beforeEach(() => {
    ({ store, mockKV } = createMockKv());
    mockEnv = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: {},
    };
  });

  describe('saveDoorState', () => {
    it('saves serialized JSON object and appends a reverse-chrono history key with TTL', async () => {
      await saveDoorState(mockEnv, 'left-door', 'OPEN');

      expect(mockKV.put).toHaveBeenCalledWith('left-door', expect.any(String));
      const parsedState = JSON.parse(store.get('left-door') || '');
      expect(parsedState.value).toBe('OPEN');
      expect(parsedState.createdAt).toBeTruthy();

      const eventKeys = [...store.keys()].filter((key) => key.startsWith('eventr:left-door:'));
      expect(eventKeys.length).toBe(1);
      expect(JSON.parse(store.get(eventKeys[0]) || '').value).toBe('OPEN');

      const historyPut = mockKV.put.mock.calls.find((call: unknown[]) =>
        String(call[0]).startsWith('eventr:left-door:'),
      );
      expect(historyPut?.[2]).toEqual({ expirationTtl: 90 * 24 * 60 * 60 });
    });

    it('preserves createdAt across duplicate OPEN writes', async () => {
      await saveDoorState(mockEnv, 'left-door', 'OPEN');
      const first = JSON.parse(store.get('left-door') || '');

      await saveDoorState(mockEnv, 'left-door', 'OPEN');
      const second = JSON.parse(store.get('left-door') || '');

      expect(second.createdAt).toBe(first.createdAt);
    });

    it('clears alert latch when door closes', async () => {
      store.set(
        'alert-latch:left-door',
        JSON.stringify({
          openCreatedAt: '2023-01-01T00:00:00.000Z',
          lastAlertSentAt: '2023-01-01T01:00:00.000Z',
        }),
      );

      await saveDoorState(mockEnv, 'left-door', 'CLOSED');
      expect(store.has('alert-latch:left-door')).toBe(false);
    });
  });

  describe('getDoorState', () => {
    it('returns stored state', async () => {
      const rawState = JSON.stringify({ value: 'CLOSED', createdAt: '2024-01-01T00:00:00.000Z' });
      await mockKV.put('right-door', rawState);

      const result = await getDoorState(mockEnv, 'right-door');
      expect(result).toEqual({
        value: 'CLOSED',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('returns UNKNOWN if missing', async () => {
      const result = await getDoorState(mockEnv, 'missing-door');
      expect(result.value).toBe('UNKNOWN');
      expect(result.createdAt).toBe('');
    });

    it('returns UNKNOWN if data is unparseable', async () => {
      await mockKV.put('invalid-door', '{invalid');
      const result = await getDoorState(mockEnv, 'invalid-door');
      expect(result).toEqual({ value: 'UNKNOWN', createdAt: '' });
    });
  });

  describe('getDoorHistory', () => {
    it('lists reverse-chrono keys with limit 10 newest first', async () => {
      const olderInv = String(
        Number.MAX_SAFE_INTEGER - Date.parse('2023-01-01T00:00:01.000Z'),
      ).padStart(16, '0');
      const newerInv = String(
        Number.MAX_SAFE_INTEGER - Date.parse('2023-01-01T00:00:02.000Z'),
      ).padStart(16, '0');
      store.set(
        `eventr:right-door:${newerInv}:a`,
        JSON.stringify({ value: 'CLOSED', createdAt: '2023-01-01T00:00:02.000Z' }),
      );
      store.set(
        `eventr:right-door:${olderInv}:b`,
        JSON.stringify({ value: 'OPEN', createdAt: '2023-01-01T00:00:01.000Z' }),
      );

      const result = await getDoorHistory(mockEnv, 'right-door');
      expect(mockKV.list).toHaveBeenCalledWith({
        prefix: 'eventr:right-door:',
        limit: 10,
      });
      expect(result.length).toBe(2);
      expect(result[0].value).toBe('CLOSED');
      expect(result[1].value).toBe('OPEN');
    });

    it('merges legacy ISO events and array until ten reverse-chrono events exist', async () => {
      const inv = String(Number.MAX_SAFE_INTEGER - Date.parse('2024-06-01T00:00:00.000Z')).padStart(
        16,
        '0',
      );
      store.set(
        `eventr:right-door:${inv}:new`,
        JSON.stringify({ value: 'OPEN', createdAt: '2024-06-01T00:00:00.000Z' }),
      );
      store.set(
        'event:right-door:2023-01-01T00:00:02.000Z:a',
        JSON.stringify({ value: 'CLOSED', createdAt: '2023-01-01T00:00:02.000Z' }),
      );
      store.set('history:right-door', JSON.stringify([{ value: 'UNKNOWN', createdAt: 'legacy' }]));

      const result = await getDoorHistory(mockEnv, 'right-door');
      expect(result.length).toBe(3);
      expect(result[0].value).toBe('OPEN');
      expect(result[1].value).toBe('CLOSED');
      expect(result[2].value).toBe('UNKNOWN');
    });

    it('falls back to legacy history array when no events exist', async () => {
      store.set(
        'history:right-door',
        JSON.stringify([
          { value: 'OPEN', createdAt: '1' },
          { value: 'CLOSED', createdAt: '2' },
        ]),
      );

      const result = await getDoorHistory(mockEnv, 'right-door');
      expect(result.length).toBe(2);
      expect(result[0].value).toBe('OPEN');
    });

    it('returns empty array if missing', async () => {
      const result = await getDoorHistory(mockEnv, 'missing-door');
      expect(result).toEqual([]);
    });
  });

  describe('message processing markers', () => {
    it('skips duplicates after complete, and pending blocks in-flight retries', async () => {
      expect(await beginMessageProcessing(mockEnv, '<abc@example.com>')).toBe(false);
      expect(await beginMessageProcessing(mockEnv, '<abc@example.com>')).toBe(true);

      await completeMessageProcessing(mockEnv, '<abc@example.com>');
      expect(await beginMessageProcessing(mockEnv, '<abc@example.com>')).toBe(true);

      const pendingKeys = [...store.keys()].filter((key) => key.startsWith('msgid:pending:'));
      const doneKeys = [...store.keys()].filter((key) => key.startsWith('msgid:done:'));
      expect(pendingKeys.length).toBe(0);
      expect(doneKeys.length).toBe(1);
      expect(doneKeys[0].length).toBeLessThan(100);
    });

    it('writes pending and done with expected TTLs', async () => {
      await beginMessageProcessing(mockEnv, '<ttl@example.com>');
      const pendingPut = mockKV.put.mock.calls.find((call: unknown[]) =>
        String(call[0]).startsWith('msgid:pending:'),
      );
      expect(pendingPut?.[2]).toEqual({ expirationTtl: 5 * 60 });

      await completeMessageProcessing(mockEnv, '<ttl@example.com>');
      const donePut = mockKV.put.mock.calls.find((call: unknown[]) =>
        String(call[0]).startsWith('msgid:done:'),
      );
      expect(donePut?.[2]).toEqual({ expirationTtl: 7 * 24 * 60 * 60 });
    });

    it('clears pending on abort so the Message-ID can be claimed again', async () => {
      expect(await beginMessageProcessing(mockEnv, '<abort@example.com>')).toBe(false);
      expect(await beginMessageProcessing(mockEnv, '<abort@example.com>')).toBe(true);

      await abortMessageProcessing(mockEnv, '<abort@example.com>');

      expect([...store.keys()].some((key) => key.startsWith('msgid:pending:'))).toBe(false);
      expect([...store.keys()].some((key) => key.startsWith('msgid:done:'))).toBe(false);
      expect(await beginMessageProcessing(mockEnv, '<abort@example.com>')).toBe(false);
    });
  });
});
