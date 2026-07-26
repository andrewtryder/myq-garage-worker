/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveDoorState, getDoorState, getDoorHistory, claimMessageId } from '../src/storage';
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
    it('saves serialized JSON object and appends an event history key', async () => {
      await saveDoorState(mockEnv, 'left-door', 'OPEN');

      expect(mockKV.put).toHaveBeenCalledWith('left-door', expect.any(String));
      const parsedState = JSON.parse(store.get('left-door') || '');
      expect(parsedState.value).toBe('OPEN');
      expect(parsedState.createdAt).toBeTruthy();

      const eventKeys = [...store.keys()].filter((key) => key.startsWith('event:left-door:'));
      expect(eventKeys.length).toBe(1);
      expect(JSON.parse(store.get(eventKeys[0]) || '').value).toBe('OPEN');
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
    it('returns append-only event history newest first', async () => {
      store.set(
        'event:right-door:2023-01-01T00:00:02.000Z:a',
        JSON.stringify({ value: 'CLOSED', createdAt: '2023-01-01T00:00:02.000Z' }),
      );
      store.set(
        'event:right-door:2023-01-01T00:00:01.000Z:b',
        JSON.stringify({ value: 'OPEN', createdAt: '2023-01-01T00:00:01.000Z' }),
      );

      const result = await getDoorHistory(mockEnv, 'right-door');
      expect(result.length).toBe(2);
      expect(result[0].value).toBe('CLOSED');
      expect(result[1].value).toBe('OPEN');
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

  describe('claimMessageId', () => {
    it('claims a Message-ID once and treats repeats as duplicates', async () => {
      expect(await claimMessageId(mockEnv, '<abc@example.com>')).toBe(false);
      expect(await claimMessageId(mockEnv, '<abc@example.com>')).toBe(true);
    });
  });
});
