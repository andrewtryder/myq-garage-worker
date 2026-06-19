import { Env, DoorStatus } from './types';

export interface MyQParsedSubject {
  deviceName: string;
  action: string;
}

export function parseMyQSubject(subject: string): MyQParsedSubject | null {
  const pattern = /myq notification:\s*(.+?)\s+(?:just\s+)?(opened|closed|stopped)/i;
  const match = subject.match(pattern);

  if (!match) {
    return null;
  }

  return {
    deviceName: match[1],
    action: match[2].toLowerCase(),
  };
}

// Global cache for resolving garage doors to avoid repetitive JSON parsing and string lowercasing
let cachedDoorsRawEnvValue: string | Record<string, string> | undefined;
let cachedLowercasedDoors: Record<string, string> | null = null;

// Reset function used primarily for tests to ensure test isolation
export function resetDoorKeyCache(): void {
  cachedDoorsRawEnvValue = undefined;
  cachedLowercasedDoors = null;
}

export function resolveDoorKey(deviceName: string, env: Env): string | null {
  // Check if our cache is still valid
  if (cachedDoorsRawEnvValue !== env.GARAGE_DOORS || cachedLowercasedDoors === null) {
    let configuredDoors: Record<string, string> = {};

    if (typeof env.GARAGE_DOORS === 'string') {
      try {
        configuredDoors = JSON.parse(env.GARAGE_DOORS);
      } catch {
        console.error('Failed to parse GARAGE_DOORS JSON string');
        // Cache the failure so we don't keep trying to parse invalid JSON on every call
        cachedDoorsRawEnvValue = env.GARAGE_DOORS;
        cachedLowercasedDoors = {};
        return null;
      }
    } else if (
      typeof env.GARAGE_DOORS === 'object' &&
      env.GARAGE_DOORS !== null &&
      !Array.isArray(env.GARAGE_DOORS)
    ) {
      configuredDoors = env.GARAGE_DOORS;
    }

    // Build the lowercased map
    const lowercasedMap: Record<string, string> = {};
    for (const [name, key] of Object.entries(configuredDoors)) {
      lowercasedMap[name.toLowerCase()] = key;
    }

    cachedLowercasedDoors = lowercasedMap;
    cachedDoorsRawEnvValue = env.GARAGE_DOORS;
  }

  const targetNameLower = deviceName.toLowerCase();
  return cachedLowercasedDoors[targetNameLower] || null;
}

export function mapActionToStatus(action: string): DoorStatus {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction === 'opened') {
    return 'OPEN';
  } else if (normalizedAction === 'closed') {
    return 'CLOSED';
  } else if (normalizedAction === 'stopped') {
    return 'STOPPED';
  }
  return 'UNKNOWN';
}
