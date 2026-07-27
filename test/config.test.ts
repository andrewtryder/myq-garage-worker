import { describe, it, expect } from 'vitest';
import { loadConfig, parseGarageDoors, isDoorStatus } from '../src/config';
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
    } as Env;

    const config = loadConfig(env);
    expect(config.apiKey).toBe('secret');
    expect(config.allowedEmailTo).toBe('garage@example.com');
    expect(config.garageDoors).toEqual({ Left: 'left' });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.garageDoors)).toBe(true);
  });

  it('exposes isDoorStatus helper', () => {
    expect(isDoorStatus('OPEN')).toBe(true);
    expect(isDoorStatus('NOPE')).toBe(false);
  });
});
