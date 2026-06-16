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

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-'); // Replace multiple - with single -
}

export function resolveDoorKey(deviceName: string, env: Env): string | null {
  let configuredDoors: string[] = [];

  if (typeof env.GARAGE_DOORS === 'string') {
    try {
      configuredDoors = JSON.parse(env.GARAGE_DOORS);
    } catch {
      // If it fails to parse, perhaps it's a single door string?
      configuredDoors = [env.GARAGE_DOORS];
    }
  } else if (Array.isArray(env.GARAGE_DOORS)) {
    configuredDoors = env.GARAGE_DOORS;
  }

  // Exact match (case insensitive)
  const matchedDoor = configuredDoors.find(
    (door) => door.toLowerCase() === deviceName.toLowerCase(),
  );

  if (matchedDoor) {
    return slugify(matchedDoor);
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
