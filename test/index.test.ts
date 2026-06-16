/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

describe('myq-garage-worker integration tests', () => {
  let mockKV: any;
  let kvStore: Map<string, string>;

  beforeEach(() => {
    kvStore = new Map();
    mockKV = {
      get: vi.fn((key: string) => Promise.resolve(kvStore.get(key) || null)),
      put: vi.fn((key: string, value: string) => {
        kvStore.set(key, value);
        return Promise.resolve();
      }),
    };
  });

  describe('Email Handler', () => {
    it('ignores emails not from notification@myq.com', async () => {
      const mockEnv: any = { GARAGE_STATE: mockKV };
      const message: any = {
        headers: new Headers({
          from: 'spam@spam.com',
          subject: 'myQ Notification: Garage Door Right just opened',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('processes Right Garage Door opened events', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const message: any = {
        headers: new Headers({
          from: 'notification@myq.com',
          subject: 'myQ Notification: Garage Door Right just opened',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('garage-right', expect.any(String));
      expect(mockKV.put).toHaveBeenCalledWith('history:garage-right', expect.any(String));

      const parsed = JSON.parse(kvStore.get('garage-right') || '');
      expect(parsed.value).toBe('OPEN');
    });

    it('processes Left Garage Door closed events', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const message: any = {
        headers: new Headers({
          from: 'notification@myq.com',
          subject: 'myQ Notification: Garage Door Left just closed',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('garage-left', expect.any(String));
      expect(mockKV.put).toHaveBeenCalledWith('history:garage-left', expect.any(String));

      const parsed = JSON.parse(kvStore.get('garage-left') || '');
      expect(parsed.value).toBe('CLOSED');
    });
  });

  describe('Fetch Handler (HTTP UI)', () => {
    it('serves HTML status page by default for dynamically configured doors', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const req = new Request('https://worker.dev');

      const response = await worker.fetch(req, mockEnv, {} as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');

      expect(mockKV.get).toHaveBeenCalledWith('garage-right');
      expect(mockKV.get).toHaveBeenCalledWith('garage-left');
      expect(mockKV.get).toHaveBeenCalledWith('history:garage-right');
      expect(mockKV.get).toHaveBeenCalledWith('history:garage-left');

      const text = await response.text();
      expect(text).toContain('Garage Door Right');
      expect(text).toContain('Garage Door Left');
    });

    it('serves HTML status page for single door JSON object string', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: '{"Main Garage": "main-garage"}',
      };
      const req = new Request('https://worker.dev');
      const response = await worker.fetch(req, mockEnv, {} as any);

      const text = await response.text();
      expect(text).toContain('Main Garage');
      expect(text).not.toContain('Garage Door Right');
    });

    it('serves JSON when ?json=true is provided', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const req = new Request('https://worker.dev?json=true');

      kvStore.set(
        'garage-right',
        JSON.stringify({ value: 'OPEN', createdAt: '2023-01-01T00:00:00.000Z' }),
      );

      const response = await worker.fetch(req, mockEnv, {} as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const json = (await response.json()) as any;

      expect(json.doors.length).toBe(2);
      expect(json.doors[1].name).toBe('Garage Door Right');
      expect(json.doors[1].state.value).toBe('OPEN');
      expect(json.history).toBeInstanceOf(Array);
    });
  });
});
