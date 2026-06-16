/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseMyQSubject, resolveDoorKey, mapActionToStatus } from '../src/email-parser';
import { Env } from '../src/types';

describe('email-parser unit tests', () => {
  const mockEnv: Env = {
    GARAGE_STATE: {} as any,
    GARAGE_DOORS: {
      'Garage Door Left': 'garage-left',
      'Garage Door Right': 'garage-right',
      'Main Garage': 'main-garage',
    },
  };

  const mockEnvString: Env = {
    GARAGE_STATE: {} as any,
    GARAGE_DOORS:
      '{"Garage Door Left": "garage-left", "Garage Door Right": "garage-right", "Main Garage": "main-garage"}',
  };

  describe('parseMyQSubject', () => {
    it('successfully parses valid opened notifications', () => {
      const result = parseMyQSubject('myQ Notification: Garage Door Right just opened');
      expect(result).toEqual({
        deviceName: 'Garage Door Right',
        action: 'opened',
      });
    });

    it('successfully parses valid closed notifications', () => {
      const result = parseMyQSubject('myQ Notification: Garage Door Left just closed');
      expect(result).toEqual({
        deviceName: 'Garage Door Left',
        action: 'closed',
      });
    });

    it('successfully parses valid stopped notifications', () => {
      const result = parseMyQSubject('myQ Notification: Garage Door Right just stopped');
      expect(result).toEqual({
        deviceName: 'Garage Door Right',
        action: 'stopped',
      });
    });

    it('returns null for unrelated subjects', () => {
      const result = parseMyQSubject('Something else entirely');
      expect(result).toBeNull();
    });

    it('is case-insensitive for prefix and action', () => {
      const result = parseMyQSubject('MYQ NOTIFICATION: Front Door OPENED');
      expect(result).toEqual({
        deviceName: 'Front Door',
        action: 'opened',
      });
    });
  });

  describe('resolveDoorKey', () => {
    it('resolves configured door object to mapped key', () => {
      const key = resolveDoorKey('Garage Door Right', mockEnv);
      expect(key).toBe('garage-right');
    });

    it('resolves configured door string (JSON) to mapped key', () => {
      const key = resolveDoorKey('Main Garage', mockEnvString);
      expect(key).toBe('main-garage');
    });

    it('resolves case-insensitively', () => {
      const key = resolveDoorKey('garage DOOR left', mockEnv);
      expect(key).toBe('garage-left');
    });

    it('returns null for unconfigured device name', () => {
      const key = resolveDoorKey('Front Gate', mockEnv);
      expect(key).toBeNull();
    });
  });

  describe('mapActionToStatus', () => {
    it('maps opened to OPEN', () => {
      expect(mapActionToStatus('opened')).toBe('OPEN');
      expect(mapActionToStatus('OPENED')).toBe('OPEN');
    });

    it('maps closed to CLOSED', () => {
      expect(mapActionToStatus('closed')).toBe('CLOSED');
      expect(mapActionToStatus('CLOSED')).toBe('CLOSED');
    });

    it('maps stopped to STOPPED', () => {
      expect(mapActionToStatus('stopped')).toBe('STOPPED');
      expect(mapActionToStatus('STOPPED')).toBe('STOPPED');
    });

    it('maps unknown action to UNKNOWN', () => {
      expect(mapActionToStatus('destroyed')).toBe('UNKNOWN');
    });
  });
});
