import { describe, it, expect } from 'vitest';
import { loadConfig, parseGarageDoors, isDoorStatus, validateGarageDoors } from '../src/config';
import { Env } from '../src/types';

describe('config', () => {
  it('parses object and JSON string garage door maps', () => {
    expect(parseGarageDoors({ Left: 'left' })).toEqual({ Left: 'left' });
    expect(parseGarageDoors('{"Right":"right"}')).toEqual({ Right: 'right' });
    expect(parseGarageDoors('not-json')).toEqual({});
    expect(parseGarageDoors(['not', 'object'] as unknown as string)).toEqual({});
    expect(parseGarageDoors({ Left: 123 } as unknown as Record<string, string>)).toEqual({});
    expect(parseGarageDoors('{"Left":123}')).toEqual({});
    expect(parseGarageDoors(undefined)).toEqual({});
  });

  it('returns immutable config with optional apiKey and allowedEmailTo', () => {
    const env = {
      GARAGE_DB: {} as D1Database,
      GARAGE_DOORS: { Left: 'left' },
      API_KEY: 'secret',
      ALLOWED_EMAIL_TO: ' Garage@Example.com ',
      STALE_AFTER_HOURS: '72',
    } as Env;

    const config = loadConfig(env);
    expect(config.apiKey).toBe('secret');
    expect(config.allowedEmailTo).toBe('garage@example.com');
    expect(config.garageDoors).toEqual({ Left: 'left' });
    expect(config.staleAfterHours).toBe(72);
    expect(config.eventTimeSkewHours).toBe(6);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.garageDoors)).toBe(true);
  });

  it('defaults staleAfterHours to 48', () => {
    const config = loadConfig({
      GARAGE_DB: {} as D1Database,
      GARAGE_DOORS: {},
    } as Env);
    expect(config.staleAfterHours).toBe(48);
    expect(config.eventTimeSkewHours).toBe(6);
  });

  it('parses EVENT_TIME_SKEW_HOURS', () => {
    const config = loadConfig({
      GARAGE_DB: {} as D1Database,
      GARAGE_DOORS: {},
      EVENT_TIME_SKEW_HOURS: '12',
    } as Env);
    expect(config.eventTimeSkewHours).toBe(12);
  });

  it('rejects ambiguous GARAGE_DOORS mappings', () => {
    expect(
      parseGarageDoors({
        'Garage Door': 'door-1',
        'garage door': 'door-2',
      }),
    ).toEqual({});
    expect(
      parseGarageDoors({
        Main: 'door-1',
        Side: 'door-1',
      }),
    ).toEqual({});
    expect(parseGarageDoors({ Main: 'Bad Id!' })).toEqual({});
  });

  it('validateGarageDoors throws on duplicate ids', () => {
    expect(() =>
      validateGarageDoors({
        Main: 'door-1',
        Side: 'door-1',
      }),
    ).toThrow(/duplicate id/);
  });

  it('exposes isDoorStatus helper', () => {
    expect(isDoorStatus('OPEN')).toBe(true);
    expect(isDoorStatus('NOPE')).toBe(false);
  });
});
