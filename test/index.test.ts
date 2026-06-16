/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { Env } from '../src/index';

describe('myq-garage-worker integration tests', () => {
  let mockEnv: Env;
  let mockKV: any;
  let kvStore: Map<string, string>;

  beforeEach(() => {
    kvStore = new Map<string, string>();
    mockKV = {
      put: vi.fn(async (key: string, val: string) => {
        kvStore.set(key, val);
      }),
      get: vi.fn(async (key: string) => {
        return kvStore.get(key) || null;
      }),
    };

    mockEnv = {
      GARAGE_STATE: mockKV,
      GARAGE_LEFT_KEY: 'left-door',
      GARAGE_RIGHT_KEY: 'right-door',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Email Handler', () => {
    it('ignores emails not from notification@myq.com', async () => {
      const logSpy = vi.spyOn(console, 'log');
      const mockMessage = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'from') return 'attacker@evil.com';
            return '';
          }),
        },
      } as any;

      await worker.email(mockMessage, mockEnv, {} as any);
      expect(logSpy).toHaveBeenCalledWith('Not a MyQ email, ignoring');
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('processes Right Garage Door opened events', async () => {
      const mockMessage = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'from') return 'notification@myq.com';
            if (key === 'subject') return 'myQ Notification: Garage Door Right just opened';
            return '';
          }),
        },
      } as any;

      await worker.email(mockMessage, mockEnv, {} as any);

      // Verify KV put was called
      expect(mockKV.put).toHaveBeenCalledWith('right-door', expect.any(String));
      expect(mockKV.put).toHaveBeenCalledWith('history:right-door', expect.any(String));

      const parsed = JSON.parse(kvStore.get('right-door') || '');
      expect(parsed.value).toBe('OPEN');
    });

    it('processes Left Garage Door closed events', async () => {
      const mockMessage = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'from') return 'notification@myq.com';
            if (key === 'subject') return 'myQ Notification: Garage Door Left just closed';
            return '';
          }),
        },
      } as any;

      await worker.email(mockMessage, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('left-door', expect.any(String));
      expect(mockKV.put).toHaveBeenCalledWith('history:left-door', expect.any(String));

      const parsed = JSON.parse(kvStore.get('left-door') || '');
      expect(parsed.value).toBe('CLOSED');
    });
  });

  describe('HTTP Fetch Handler', () => {
    it('returns the HTML status page with current values and history timeline', async () => {
      // Populate mock KV storage
      kvStore.set(
        'right-door',
        JSON.stringify({ value: 'OPEN', createdAt: '2026-06-06T10:00:00Z' }),
      );
      kvStore.set(
        'left-door',
        JSON.stringify({ value: 'CLOSED', createdAt: '2026-06-06T10:05:00Z' }),
      );
      kvStore.set(
        'history:right-door',
        JSON.stringify([{ value: 'OPEN', createdAt: '2026-06-06T10:00:00Z' }]),
      );
      kvStore.set(
        'history:left-door',
        JSON.stringify([{ value: 'CLOSED', createdAt: '2026-06-06T10:05:00Z' }]),
      );

      const request = new Request('https://myq-garage-worker.mrcoffee.workers.dev/');
      const response = await worker.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('Garage Door Right');
      expect(html).toContain('Garage Door Left');
      expect(html).toContain('OPEN');
      expect(html).toContain('CLOSED');
      expect(html).toContain('2026-06-06T10:00:00Z');
      expect(html).toContain('2026-06-06T10:05:00Z');
      expect(html).toContain('Recent Activity Log');
    });

    it('returns JSON data including history when search parameter json=true is present', async () => {
      kvStore.set(
        'right-door',
        JSON.stringify({ value: 'OPEN', createdAt: '2026-06-06T10:00:00Z' }),
      );
      kvStore.set(
        'left-door',
        JSON.stringify({ value: 'CLOSED', createdAt: '2026-06-06T10:05:00Z' }),
      );
      kvStore.set(
        'history:right-door',
        JSON.stringify([{ value: 'OPEN', createdAt: '2026-06-06T10:00:00Z' }]),
      );
      kvStore.set(
        'history:left-door',
        JSON.stringify([{ value: 'CLOSED', createdAt: '2026-06-06T10:05:00Z' }]),
      );

      const request = new Request('https://myq-garage-worker.mrcoffee.workers.dev/?json=true');
      const response = await worker.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = await response.json();
      expect(body.right).toEqual({ value: 'OPEN', createdAt: '2026-06-06T10:00:00Z' });
      expect(body.left).toEqual({ value: 'CLOSED', createdAt: '2026-06-06T10:05:00Z' });
      expect(body.history).toEqual([
        { value: 'CLOSED', createdAt: '2026-06-06T10:05:00Z', door: 'left' },
        { value: 'OPEN', createdAt: '2026-06-06T10:00:00Z', door: 'right' },
      ]);
    });
  });
});
