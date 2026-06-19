import { describe, it, expect } from 'vitest';
import { buildHaDevices, mapHaDeviceStatus, parseGarageDoorsString, routeRequiresAuth } from '../src/doors';
import { Env } from '../src/types';

describe('doors helpers', () => {
  describe('parseGarageDoorsString', () => {
    it('parses valid JSON', () => {
      expect(
        parseGarageDoorsString('{"Garage Door Left":"garage-left","Garage Door Right":"garage-right"}'),
      ).toEqual({
        'Garage Door Left': 'garage-left',
        'Garage Door Right': 'garage-right',
      });
    });

    it('parses legacy shell-mangled format from older deploys', () => {
      expect(
        parseGarageDoorsString(
          "'{Garage Door Left:garage-left,Garage Door Right:garage-right}'",
        ),
      ).toEqual({
        'Garage Door Left': 'garage-left',
        'Garage Door Right': 'garage-right',
      });
    });
  });

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

    it('does not require auth for HTML dashboard', () => {
      expect(routeRequiresAuth(new Request('https://worker.dev/'), env)).toBe(false);
    });

    it('requires auth for /devices, ?json=true, and POST /simulate', () => {
      expect(routeRequiresAuth(new Request('https://worker.dev/devices'), env)).toBe(true);
      expect(routeRequiresAuth(new Request('https://worker.dev/?json=true'), env)).toBe(true);
      expect(
        routeRequiresAuth(
          new Request('https://worker.dev/simulate', { method: 'POST', body: '{}' }),
          env,
        ),
      ).toBe(true);
    });

    it('does not require auth when API_KEY is unset', () => {
      expect(routeRequiresAuth(new Request('https://worker.dev/devices'), {} as Env)).toBe(false);
    });
  });
});
