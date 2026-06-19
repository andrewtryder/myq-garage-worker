import { Env, DoorStatus } from './types';
import { parseConfiguredDoors } from './doors';

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

export function resolveDoorKey(deviceName: string, env: Env): string | null {
  const configuredDoors = parseConfiguredDoors(env);
  // Exact match (case insensitive) on keys
  const targetNameLower = deviceName.toLowerCase();
  for (const [name, key] of Object.entries(configuredDoors)) {
    if (name.toLowerCase() === targetNameLower) {
      return key;
    }
  }

  return null;
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
