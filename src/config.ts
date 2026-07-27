import { DoorStatus, Env } from './types';

export interface AppConfig {
  garageDoors: Readonly<Record<string, string>>;
  apiKey: string | undefined;
  allowedEmailTo: string | undefined;
  staleAfterHours: number;
}

const DEFAULT_STALE_AFTER_HOURS = 48;

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

export function parseStaleAfterHours(raw: Env['STALE_AFTER_HOURS'] | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return DEFAULT_STALE_AFTER_HOURS;
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
    staleAfterHours: parseStaleAfterHours(env.STALE_AFTER_HOURS),
  });
}

export function isDoorStatus(value: string): value is DoorStatus {
  return value === 'OPEN' || value === 'CLOSED' || value === 'STOPPED' || value === 'UNKNOWN';
}
