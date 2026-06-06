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

export function resolveFeedKey(deviceName: string, env: Env): string | null {
  if (/garage door right/i.test(deviceName)) {
    return env.GARAGE_RIGHT_FEED;
  } else if (/garage door left/i.test(deviceName)) {
    return env.GARAGE_LEFT_FEED;
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
