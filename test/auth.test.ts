import { describe, it, expect } from 'vitest';
import { extractApiKey, isApiKeyAuthorized, routeRequiresApiKey } from '../src/auth';
import { Env } from '../src/types';

describe('auth', () => {
  it('extracts Bearer and x-api-key values', () => {
    expect(
      extractApiKey(
        new Request('https://worker.dev/devices', {
          headers: { Authorization: 'Bearer secret' },
        }),
      ),
    ).toBe('secret');
    expect(
      extractApiKey(
        new Request('https://worker.dev/devices', {
          headers: { 'x-api-key': ' from-header ' },
        }),
      ),
    ).toBe('from-header');
    expect(extractApiKey(new Request('https://worker.dev/devices'))).toBeNull();
    expect(
      extractApiKey(
        new Request('https://worker.dev/devices', {
          headers: { Authorization: 'Bearer   ' },
        }),
      ),
    ).toBeNull();
  });

  it('authorizes only when API_KEY matches', () => {
    const env = { API_KEY: 'secret' } as Env;
    expect(
      isApiKeyAuthorized(
        new Request('https://worker.dev/devices', {
          headers: { Authorization: 'Bearer secret' },
        }),
        env,
      ),
    ).toBe(true);
    expect(
      isApiKeyAuthorized(
        new Request('https://worker.dev/devices', {
          headers: { Authorization: 'Bearer wrong' },
        }),
        env,
      ),
    ).toBe(false);
    expect(isApiKeyAuthorized(new Request('https://worker.dev/devices'), {} as Env)).toBe(false);
  });

  it('requires API key only for machine routes', () => {
    expect(routeRequiresApiKey(new Request('https://worker.dev/devices'))).toBe(true);
    expect(routeRequiresApiKey(new Request('https://worker.dev/?json=true'))).toBe(true);
    expect(routeRequiresApiKey(new Request('https://worker.dev/'))).toBe(false);
  });
});
