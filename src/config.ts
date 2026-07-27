import { DoorStatus, Env } from './types';
import { DEFAULT_EVENT_TIME_SKEW_HOURS } from './email-time';

export interface AppConfig {
  garageDoors: Readonly<Record<string, string>>;
  apiKey: string | undefined;
  allowedEmailTo: string | undefined;
  staleAfterHours: number;
  eventTimeSkewHours: number;
}

const DEFAULT_STALE_AFTER_HOURS = 48;
const DOOR_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export class GarageDoorsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GarageDoorsValidationError';
  }
}

function isDoorMap(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Validate door name → id map. Throws GarageDoorsValidationError on invalid input.
 */
export function validateGarageDoors(raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();

  for (const [name, id] of Object.entries(raw)) {
    const trimmedName = name.trim();
    const trimmedId = id.trim();

    if (!trimmedName) {
      throw new GarageDoorsValidationError('GARAGE_DOORS door names must be non-empty');
    }
    if (!trimmedId) {
      throw new GarageDoorsValidationError(
        `GARAGE_DOORS id for "${trimmedName}" must be non-empty`,
      );
    }
    if (!DOOR_ID_PATTERN.test(trimmedId)) {
      throw new GarageDoorsValidationError(
        `GARAGE_DOORS id "${trimmedId}" must match ${DOOR_ID_PATTERN}`,
      );
    }

    const nameKey = trimmedName.toLowerCase();
    if (seenNames.has(nameKey)) {
      throw new GarageDoorsValidationError(
        `GARAGE_DOORS has case-insensitive duplicate name "${trimmedName}"`,
      );
    }
    if (seenIds.has(trimmedId)) {
      throw new GarageDoorsValidationError(`GARAGE_DOORS has duplicate id "${trimmedId}"`);
    }

    seenNames.add(nameKey);
    seenIds.add(trimmedId);
    result[trimmedName] = trimmedId;
  }

  return result;
}

export function parseGarageDoors(raw: Env['GARAGE_DOORS'] | undefined): Record<string, string> {
  let candidate: Record<string, string>;

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isDoorMap(parsed)) {
        console.error('GARAGE_DOORS JSON must be an object mapping names to keys');
        return {};
      }
      candidate = parsed;
    } catch {
      console.error('Failed to parse GARAGE_DOORS JSON string');
      return {};
    }
  } else if (isDoorMap(raw)) {
    candidate = raw;
  } else {
    return {};
  }

  try {
    return validateGarageDoors(candidate);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'Invalid GARAGE_DOORS');
    return {};
  }
}

function parsePositiveHours(raw: string | number | undefined, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

export function parseStaleAfterHours(raw: Env['STALE_AFTER_HOURS'] | undefined): number {
  return parsePositiveHours(raw, DEFAULT_STALE_AFTER_HOURS);
}

export function parseEventTimeSkewHours(raw: Env['EVENT_TIME_SKEW_HOURS'] | undefined): number {
  return parsePositiveHours(raw, DEFAULT_EVENT_TIME_SKEW_HOURS);
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
    eventTimeSkewHours: parseEventTimeSkewHours(env.EVENT_TIME_SKEW_HOURS),
  });
}

export function isDoorStatus(value: string): value is DoorStatus {
  return value === 'OPEN' || value === 'CLOSED' || value === 'STOPPED' || value === 'UNKNOWN';
}
