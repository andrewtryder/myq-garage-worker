import { describe, it, expect } from 'vitest';
import { buildHaDevices, mapHaDeviceStatus } from '../src/doors';
import { routeRequiresApiKey } from '../src/auth';

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

  describe('routeRequiresApiKey', () => {
    it('requires API key only for machine status endpoints', () => {
      expect(routeRequiresApiKey(new Request('https://worker.dev/devices'))).toBe(true);
      expect(routeRequiresApiKey(new Request('https://worker.dev/?json=true'))).toBe(true);
    });

    it('does not require API key for browser dashboard or mutation routes', () => {
      expect(routeRequiresApiKey(new Request('https://worker.dev/'))).toBe(false);
      expect(
        routeRequiresApiKey(
          new Request('https://worker.dev/simulate', { method: 'POST', body: '{}' }),
        ),
      ).toBe(false);
      expect(
        routeRequiresApiKey(
          new Request('https://worker.dev/alert-config', { method: 'POST', body: '{}' }),
        ),
      ).toBe(false);
      expect(
        routeRequiresApiKey(
          new Request('https://worker.dev/test-alert', { method: 'POST', body: '{}' }),
        ),
      ).toBe(false);
    });
  });
});
