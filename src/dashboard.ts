import { DoorStatus, Env } from './types';
import { loadAllDoors } from './doors';
import { formatDuration } from './format';

export interface DashboardDoor {
  id: string;
  name: string;
  status: DoorStatus;
  stateSince: string;
  durationSeconds: number | null;
  durationText: string | null;
}

export interface DashboardEvent {
  doorId: string;
  doorName: string;
  status: string;
  createdAt: string;
}

export interface DashboardResponse {
  generatedAt: string;
  doors: DashboardDoor[];
  recentEvents: DashboardEvent[];
}

export async function buildDashboard(env: Env, nowMs = Date.now()): Promise<DashboardResponse> {
  const { allDoorData } = await loadAllDoors(env);

  const doors: DashboardDoor[] = allDoorData.map((door) => {
    let durationSeconds: number | null = null;
    let durationText: string | null = null;

    if (door.state.createdAt) {
      const createdAtMs = new Date(door.state.createdAt).getTime();
      if (!isNaN(createdAtMs)) {
        const durationMs = Math.max(0, nowMs - createdAtMs);
        durationSeconds = Math.floor(durationMs / 1000);
        durationText = formatDuration(durationMs);
      }
    }

    return {
      id: door.key,
      name: door.name,
      status: door.state.value,
      stateSince: door.state.createdAt,
      durationSeconds,
      durationText,
    };
  });

  const recentEvents: DashboardEvent[] = [];
  for (const door of allDoorData) {
    for (const item of door.history) {
      recentEvents.push({
        doorId: door.key,
        doorName: door.name,
        status: item.value,
        createdAt: item.createdAt,
      });
    }
  }
  recentEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    generatedAt: new Date(nowMs).toISOString(),
    doors,
    recentEvents: recentEvents.slice(0, 10),
  };
}
