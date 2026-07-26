import { DoorStatus, Env } from './types';

export interface AppConfig {
  garageDoors: Readonly<Record<string, string>>;
  apiKey: string | undefined;
  allowedEmailTo: string | undefined;
}

function isDoorMap(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

export function parseGarageDoors(raw: Env['GARAGE_DOORS'] | undefined): Record<string, string> {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isDoorMap(parsed)) {
        return { ...parsed };
      }
      console.error('GARAGE_DOORS JSON must be an object mapping names to keys');
      return {};
    } catch {
      console.error('Failed to parse GARAGE_DOORS JSON string');
      return {};
    }
  }

  if (isDoorMap(raw)) {
    return { ...raw };
  }

  return {};
}

export function loadConfig(env: Env): AppConfig {
  const allowedEmailTo =
    typeof env.ALLOWED_EMAIL_TO === 'string' && env.ALLOWED_EMAIL_TO.trim().length > 0
      ? env.ALLOWED_EMAIL_TO.trim().toLowerCase()
      : undefined;

  return Object.freeze({
    garageDoors: Object.freeze(parseGarageDoors(env.GARAGE_DOORS)),
    apiKey: typeof env.API_KEY === 'string' && env.API_KEY.length > 0 ? env.API_KEY : undefined,
    allowedEmailTo,
  });
}

export function isDoorStatus(value: string): value is DoorStatus {
  return value === 'OPEN' || value === 'CLOSED' || value === 'STOPPED' || value === 'UNKNOWN';
}
