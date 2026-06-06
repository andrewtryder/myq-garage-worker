/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { Env } from '../src/index';

describe('myq-garage-worker tests', () => {
  let mockEnv: Env;
  let fetchMock: any;

  beforeEach(() => {
    mockEnv = {
      ADAFRUIT_USERNAME: 'test-user',
      ADAFRUIT_IO_KEY: 'test-key',
      GARAGE_LEFT_FEED: 'left-feed',
      GARAGE_RIGHT_FEED: 'right-feed',
    };

    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
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
    });

    it('processes Right Garage Door opened events', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => 'OK',
      });

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

      // Verify fetch was called with Adafruit URL and POST method
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://io.adafruit.com/api/v2/test-user/feeds/right-feed/data');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ value: 'OPEN' });
      expect(options.headers['X-AIO-Key']).toBe('test-key');
    });

    it('processes Left Garage Door closed events', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => 'OK',
      });

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

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://io.adafruit.com/api/v2/test-user/feeds/left-feed/data');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ value: 'CLOSED' });
    });
  });

  describe('HTTP Fetch Handler', () => {
    it('returns the HTML status page with current values', async () => {
      // Mock two GET requests to Adafruit
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: 'OPEN', created_at: '2026-06-06T10:00:00Z' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: 'CLOSED', created_at: '2026-06-06T10:05:00Z' }),
      });

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
    });
  });
});
