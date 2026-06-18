import { Env, DoorState } from './types';
import { getDoorState, getDoorHistory } from './storage';
import { DoorData, HistoryEntry, formatDuration } from './status-page';

export interface LoadedDoor {
  name: string;
  key: string;
  state: DoorState;
  history: DoorState[];
}

export function parseConfiguredDoors(env: Env): Record<string, string> {
  if (typeof env.GARAGE_DOORS === 'string') {
    try {
      return JSON.parse(env.GARAGE_DOORS);
    } catch {
      console.error('Failed to parse GARAGE_DOORS JSON string');
      return {};
    }
  }

  if (
    typeof env.GARAGE_DOORS === 'object' &&
    env.GARAGE_DOORS !== null &&
    !Array.isArray(env.GARAGE_DOORS)
  ) {
    return env.GARAGE_DOORS;
  }

  return {};
}

export async function loadAllDoors(env: Env): Promise<{
  allDoorData: LoadedDoor[];
  doors: DoorData[];
  combinedHistory: HistoryEntry[];
}> {
  const configuredDoors = parseConfiguredDoors(env);

  const doorDataPromises = Object.entries(configuredDoors).map(async ([doorName, doorKey]) => {
    const [state, history] = await Promise.all([
      getDoorState(env, doorKey),
      getDoorHistory(env, doorKey),
    ]);
    return {
      name: doorName,
      key: doorKey,
      state,
      history,
    };
  });

  const allDoorData = await Promise.all(doorDataPromises);
  const nowMs = Date.now();

  const doors: DoorData[] = allDoorData.map((d) => {
    let durationMs: number | undefined;
    let durationText: string | undefined;

    if (d.state.createdAt) {
      const createdAtMs = new Date(d.state.createdAt).getTime();
      if (!isNaN(createdAtMs)) {
        durationMs = nowMs - createdAtMs;
        durationText = formatDuration(durationMs);
      }
    }

    return {
      name: d.name,
      state: d.state,
      durationMs,
      durationText,
    };
  });

  let combinedHistory: HistoryEntry[] = [];
  allDoorData.forEach((d) => {
    const doorHistory: HistoryEntry[] = d.history.map((item) => ({
      ...item,
      doorName: d.name,
    }));
    combinedHistory = combinedHistory.concat(doorHistory);
  });

  combinedHistory.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    allDoorData,
    doors,
    combinedHistory: combinedHistory.slice(0, 10),
  };
}

export function mapHaDeviceStatus(value: string | undefined): 'open' | 'closed' | null {
  const upper = (value || '').toUpperCase();
  if (upper === 'OPEN') return 'open';
  if (upper === 'CLOSED') return 'closed';
  return null;
}

export interface HaDevice {
  id: string;
  name: string;
  status: 'open' | 'closed';
}

export function buildHaDevices(allDoorData: LoadedDoor[]): HaDevice[] {
  return allDoorData.flatMap((door) => {
    const status = mapHaDeviceStatus(door.state.value);
    if (!status) return [];
    return [{ id: door.key, name: door.name, status }];
  });
}

export function routeRequiresAuth(request: Request, env: Env): boolean {
  if (!env.API_KEY) return false;

  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/simulate') return true;
  if (request.method === 'GET' && url.pathname === '/devices') return true;
  if (request.method === 'GET' && url.searchParams.get('json') === 'true') return true;

  return false;
}
