/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveDoorState, getDoorState, getDoorHistory } from '../src/storage';
import { Env, DoorState } from '../src/types';

describe('storage KV tests', () => {
  let mockKV: any;
  let store: Map<string, string>;
  let mockEnv: Env;

  beforeEach(() => {
    store = new Map();
    mockKV = {
      get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
      put: vi.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
    };

    mockEnv = {
      GARAGE_STATE: mockKV,
      GARAGE_DOORS: {},
    };
  });

  describe('saveDoorState', () => {
    it('saves serialized JSON object and appends to history', async () => {
      await saveDoorState(mockEnv, 'left-door', 'OPEN');

      // Check current state write
      expect(mockKV.put).toHaveBeenCalledWith('left-door', expect.any(String));
      const parsedState = JSON.parse(store.get('left-door') || '');
      expect(parsedState.value).toBe('OPEN');
      expect(parsedState.createdAt).toBeTruthy();

      expect(mockKV.put).toHaveBeenCalledWith('history:left-door', expect.any(String));
      const parsedHistory = JSON.parse(store.get('history:left-door') || '[]');
      expect(parsedHistory.length).toBe(1);
      expect(parsedHistory[0].value).toBe('OPEN');
    });

    it('caps history array to 20 entries', async () => {
      const initialHistory: DoorState[] = Array(20)
        .fill(null)
        .map((_, i) => ({
          value: 'CLOSED',
          createdAt: `2023-01-01T00:00:${i.toString().padStart(2, '0')}.000Z`,
        }));

      store.set('history:left-door', JSON.stringify(initialHistory));

      await saveDoorState(mockEnv, 'left-door', 'OPEN');

      const parsedHistory = JSON.parse(store.get('history:left-door') || '[]');
      expect(parsedHistory.length).toBe(20);
      // Ensure the newest entry is at the top
      expect(parsedHistory[0].value).toBe('OPEN');
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
  });

  describe('getDoorHistory', () => {
    it('returns parsed history array', async () => {
      const rawHistory = JSON.stringify([
        { value: 'OPEN', createdAt: '1' },
        { value: 'CLOSED', createdAt: '2' },
      ]);
      store.set('history:right-door', rawHistory);

      const result = await getDoorHistory(mockEnv, 'right-door');
      expect(result.length).toBe(2);
      expect(result[0].value).toBe('OPEN');
    });

    it('returns empty array if missing', async () => {
      const result = await getDoorHistory(mockEnv, 'missing-door');
      expect(result).toEqual([]);
    });
  });
});
