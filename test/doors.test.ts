import { describe, it, expect } from 'vitest';
import { buildHaDevices, mapHaDeviceStatus, routeRequiresAuth } from '../src/doors';
import { Env } from '../src/types';

describe('doors helpers', () => {
  describe('mapHaDeviceStatus', () => {
    it('maps OPEN and CLOSED to lowercase HA statuses', () => {
      expect(mapHaDeviceStatus('OPEN')).toBe('open');
      expect(mapHaDeviceStatus('CLOSED')).toBe('closed');
    });

    it('returns null for STOPPED, UNKNOWN, and missing values', () => {
      expect(mapHaDeviceStatus('STOPPED')).toBeNull();
      expect(mapHaDeviceStatus('UNKNOWN')).toBeNull();
      expect(mapHaDeviceStatus(undefined)).toBeNull();
    });
  });

  describe('buildHaDevices', () => {
    it('uses KV keys as id and omits non-open/closed doors', () => {
      const devices = buildHaDevices([
        {
          name: 'Garage Door Left',
          key: 'garage-left',
          state: { value: 'OPEN', createdAt: '2023-01-01T00:00:00.000Z' },
          history: [],
        },
        {
          name: 'Garage Door Right',
          key: 'garage-right',
          state: { value: 'STOPPED', createdAt: '2023-01-01T00:00:00.000Z' },
          history: [],
        },
      ]);

      expect(devices).toEqual([{ id: 'garage-left', name: 'Garage Door Left', status: 'open' }]);
    });
  });

  describe('routeRequiresAuth', () => {
    const env = { API_KEY: 'secret' } as Env;

    it('requires auth for HTML dashboard at /', () => {
      expect(routeRequiresAuth(new Request('https://worker.dev/'), env)).toBe(true);
    });

    it('requires auth for /devices, ?json=true, POST /simulate, /alert-config, and /test-alert', () => {
      expect(routeRequiresAuth(new Request('https://worker.dev/devices'), env)).toBe(true);
      expect(routeRequiresAuth(new Request('https://worker.dev/?json=true'), env)).toBe(true);
      expect(
        routeRequiresAuth(
          new Request('https://worker.dev/simulate', { method: 'POST', body: '{}' }),
          env,
        ),
      ).toBe(true);
      expect(
        routeRequiresAuth(
          new Request('https://worker.dev/alert-config', { method: 'POST', body: '{}' }),
          env,
        ),
      ).toBe(true);
      expect(
        routeRequiresAuth(
          new Request('https://worker.dev/test-alert', { method: 'POST', body: '{}' }),
          env,
        ),
      ).toBe(true);
    });

    it('does not require auth when API_KEY is unset', () => {
      expect(routeRequiresAuth(new Request('https://worker.dev/devices'), {} as Env)).toBe(false);
    });
  });
});
