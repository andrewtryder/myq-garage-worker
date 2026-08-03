/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasFailedEmailAuthentication,
  isAcceptableMyQSender,
  isAllowedRecipient,
  isMyQEnvelopeSender,
  isMyQHeaderFrom,
  parseAddressFromHeader,
  parseMyQSubject,
  resolveDoorKey,
  mapActionToStatus,
  resetDoorKeyCache,
} from '../src/email-parser';
import { Env } from '../src/types';

describe('email-parser unit tests', () => {
  const mockEnv: Env = {
    GARAGE_DB: {} as any,

    GARAGE_DOORS: {
      'Garage Door Left': 'garage-left',
      'Garage Door Right': 'garage-right',
      'Main Garage': 'main-garage',
    },
  };

  const mockEnvString: Env = {
    GARAGE_DB: {} as any,

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
    beforeEach(() => {
      resetDoorKeyCache();
    });
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

  describe('isMyQEnvelopeSender', () => {
    it('matches only the exact MyQ envelope sender', () => {
      expect(isMyQEnvelopeSender('notification@myq.com')).toBe(true);
      expect(isMyQEnvelopeSender(' notification@myq.com ')).toBe(true);
      expect(isMyQEnvelopeSender('notification@myq.com.attacker.example')).toBe(false);
      expect(isMyQEnvelopeSender('evil@example.com')).toBe(false);
    });
  });

  describe('parseAddressFromHeader / isMyQHeaderFrom', () => {
    it('parses bare and display-name From headers', () => {
      expect(parseAddressFromHeader('notification@myq.com')).toBe('notification@myq.com');
      expect(parseAddressFromHeader('myQ <notification@myq.com>')).toBe('notification@myq.com');
      expect(parseAddressFromHeader('"Chamberlain" <notification@myq.com>')).toBe(
        'notification@myq.com',
      );
      expect(parseAddressFromHeader('not-an-email')).toBeNull();
      expect(parseAddressFromHeader(null)).toBeNull();
    });

    it('detects myQ header From', () => {
      expect(isMyQHeaderFrom('myQ Notifications <notification@myq.com>')).toBe(true);
      expect(isMyQHeaderFrom('other@example.com')).toBe(false);
    });
  });

  describe('isAcceptableMyQSender', () => {
    it('accepts direct myQ envelope without forwarder config', () => {
      expect(
        isAcceptableMyQSender({
          envelopeFrom: 'notification@myq.com',
          headerFrom: 'someone@else.com',
          allowedForwardFrom: undefined,
        }),
      ).toBe(true);
    });

    it('accepts configured forwarder when header From is myQ', () => {
      expect(
        isAcceptableMyQSender({
          envelopeFrom: 'user@gmail.com',
          headerFrom: 'myQ <notification@myq.com>',
          allowedForwardFrom: 'user@gmail.com',
        }),
      ).toBe(true);
    });

    it('accepts configured forwarder when From is rewritten but subject is myQ', () => {
      expect(
        isAcceptableMyQSender({
          envelopeFrom: 'user@gmail.com',
          headerFrom: 'user@gmail.com',
          allowedForwardFrom: 'user@gmail.com',
          subject: 'myQ Notification: Garage Door Left just opened',
        }),
      ).toBe(true);
    });

    it('rejects Gmail envelope without ALLOWED_FORWARD_FROM', () => {
      expect(
        isAcceptableMyQSender({
          envelopeFrom: 'user@gmail.com',
          headerFrom: 'notification@myq.com',
          allowedForwardFrom: undefined,
        }),
      ).toBe(false);
    });

    it('rejects forged header From with wrong envelope', () => {
      expect(
        isAcceptableMyQSender({
          envelopeFrom: 'attacker@evil.com',
          headerFrom: 'notification@myq.com',
          allowedForwardFrom: 'user@gmail.com',
        }),
      ).toBe(false);
    });

    it('rejects forwarder envelope when header From and subject are not myQ', () => {
      expect(
        isAcceptableMyQSender({
          envelopeFrom: 'user@gmail.com',
          headerFrom: 'user@gmail.com',
          allowedForwardFrom: 'user@gmail.com',
          subject: 'Hello world',
        }),
      ).toBe(false);
    });
  });

  describe('isAllowedRecipient', () => {
    it('allows any recipient when ALLOWED_EMAIL_TO is unset', () => {
      expect(isAllowedRecipient('anything@example.com', undefined)).toBe(true);
    });

    it('requires exact normalized match when configured', () => {
      expect(isAllowedRecipient('garage@example.com', 'garage@example.com')).toBe(true);
      expect(isAllowedRecipient(' Garage@Example.com ', 'garage@example.com')).toBe(true);
      expect(isAllowedRecipient('other@example.com', 'garage@example.com')).toBe(false);
    });
  });

  describe('hasFailedEmailAuthentication', () => {
    it('allows missing Authentication-Results', () => {
      expect(hasFailedEmailAuthentication(null)).toBe(false);
      expect(hasFailedEmailAuthentication('')).toBe(false);
    });

    it('rejects clear dkim/dmarc failures', () => {
      expect(hasFailedEmailAuthentication('mx.google.com; dkim=fail header.d=myq.com')).toBe(true);
      expect(hasFailedEmailAuthentication('mx.google.com; dmarc=fail action=none')).toBe(true);
      expect(hasFailedEmailAuthentication('mx.google.com; dkim=pass header.d=myq.com')).toBe(false);
    });
  });
});
