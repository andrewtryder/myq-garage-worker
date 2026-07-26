import { loadConfig } from './config';
import { DoorState, DoorStatus, Env } from './types';
import { getDoorState, getDoorHistory } from './storage';
import { DoorData, HistoryEntry, formatDuration } from './status-page';

export interface LoadedDoor {
  name: string;
  key: string;
  state: DoorState;
  history: DoorState[];
}

/** @deprecated Use loadConfig(env).garageDoors — kept for scripts/tests that import by name. */
export function parseConfiguredDoors(env: Env): Record<string, string> {
  return { ...loadConfig(env).garageDoors };
}

export async function loadAllDoors(env: Env): Promise<{
  allDoorData: LoadedDoor[];
  doors: DoorData[];
  combinedHistory: HistoryEntry[];
}> {
  const configuredDoors = loadConfig(env).garageDoors;

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

  const combinedHistory: HistoryEntry[] = [];
  for (const d of allDoorData) {
    for (const item of d.history) {
      combinedHistory.push({
        ...item,
        doorName: d.name,
      });
    }
  }

  combinedHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    allDoorData,
    doors,
    combinedHistory: combinedHistory.slice(0, 10),
  };
}

export function mapHaDeviceStatus(
  value: DoorStatus | string | undefined,
): 'open' | 'closed' | null {
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
