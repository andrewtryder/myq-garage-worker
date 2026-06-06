/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postToAdafruit, getLastFromAdafruit } from '../src/adafruit';
import { Env } from '../src/types';

describe('adafruit unit tests', () => {
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

  describe('postToAdafruit', () => {
    it('successfully posts data to Adafruit feed', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => 'OK',
      });

      await postToAdafruit(mockEnv, 'right-feed', 'OPEN');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://io.adafruit.com/api/v2/test-user/feeds/right-feed/data');
      expect(options.method).toBe('POST');
      expect(options.headers['X-AIO-Key']).toBe('test-key');
      expect(JSON.parse(options.body)).toEqual({ value: 'OPEN' });
    });

    it('throws error when Adafruit post fails', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid value',
      });

      await expect(postToAdafruit(mockEnv, 'right-feed', 'OPEN')).rejects.toThrow(
        'Adafruit IO error 400',
      );
    });
  });

  describe('getLastFromAdafruit', () => {
    it('successfully retrieves last value from feed', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'closed', created_at: '2026-06-06T12:00:00Z' }),
      });

      const result = await getLastFromAdafruit(mockEnv, 'left-feed');

      expect(result).toEqual({
        value: 'CLOSED',
        createdAt: '2026-06-06T12:00:00Z',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://io.adafruit.com/api/v2/test-user/feeds/left-feed/data/last?include=value,created_at',
      );
      expect(options.headers['X-AIO-Key']).toBe('test-key');
    });

    it('returns null when feed fetch fails', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await getLastFromAdafruit(mockEnv, 'left-feed');
      expect(result).toBeNull();
    });
  });
});
