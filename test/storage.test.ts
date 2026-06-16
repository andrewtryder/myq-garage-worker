/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveDoorState, getDoorState, getDoorHistory } from '../src/storage';
import { Env } from '../src/types';

describe('storage KV tests', () => {
  let mockKV: any;
  let mockEnv: Env;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    mockKV = {
      put: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
      }),
      get: vi.fn(async (key: string) => {
        return store.get(key) || null;
      }),
    };

    mockEnv = {
      GARAGE_STATE: mockKV,
      GARAGE_LEFT_KEY: 'left-door',
      GARAGE_RIGHT_KEY: 'right-door',
    };
  });

  it('saveDoorState saves serialized JSON object and appends to history', async () => {
    await saveDoorState(mockEnv, 'left-door', 'OPEN');

    // 1. Check latest state
    expect(mockKV.put).toHaveBeenCalledWith('left-door', expect.any(String));
    const parsedState = JSON.parse(store.get('left-door') || '');
    expect(parsedState.value).toBe('OPEN');

    // 2. Check history log
    expect(mockKV.put).toHaveBeenCalledWith('history:left-door', expect.any(String));
    const parsedHistory = JSON.parse(store.get('history:left-door') || '[]');
    expect(parsedHistory).toHaveLength(1);
    expect(parsedHistory[0].value).toBe('OPEN');
    expect(new Date(parsedHistory[0].createdAt).getTime()).not.toBeNaN();
  });

  it('saveDoorState caps history array to 20 entries', async () => {
    // Fill history with 25 initial dummy records
    const initialHistory = Array.from({ length: 25 }, (_, i) => ({
      value: 'CLOSED',
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    }));
    store.set('history:left-door', JSON.stringify(initialHistory));

    await saveDoorState(mockEnv, 'left-door', 'OPEN');

    const parsedHistory = JSON.parse(store.get('history:left-door') || '[]');
    expect(parsedHistory).toHaveLength(20);
    expect(parsedHistory[0].value).toBe('OPEN'); // Newest is prepended
  });

  it('getDoorState retrieves and parses stored state', async () => {
    const rawState = JSON.stringify({ value: 'CLOSED', createdAt: '2026-06-06T20:00:00.000Z' });
    await mockKV.put('right-door', rawState);

    const result = await getDoorState(mockEnv, 'right-door');
    expect(result).toEqual({
      value: 'CLOSED',
      createdAt: '2026-06-06T20:00:00.000Z',
    });
  });

  it('getDoorState returns default state if key is not found', async () => {
    const result = await getDoorState(mockEnv, 'non-existent');
    expect(result).toEqual({
      value: 'UNKNOWN',
      createdAt: '',
    });
  });

  it('getDoorHistory retrieves and parses log history', async () => {
    const rawHistory = JSON.stringify([
      { value: 'OPEN', createdAt: '2026-06-06T20:00:00.000Z' },
      { value: 'CLOSED', createdAt: '2026-06-06T19:00:00.000Z' },
    ]);
    store.set('history:right-door', rawHistory);

    const result = await getDoorHistory(mockEnv, 'right-door');
    expect(result).toEqual([
      { value: 'OPEN', createdAt: '2026-06-06T20:00:00.000Z' },
      { value: 'CLOSED', createdAt: '2026-06-06T19:00:00.000Z' },
    ]);
  });
});
