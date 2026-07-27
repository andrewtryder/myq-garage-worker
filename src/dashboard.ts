import { loadConfig } from './config';
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
  lastEventAt: string | null;
  stale: boolean;
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
  lastEventAt: string | null;
  staleAfterHours: number;
  stale: boolean;
  openCount: number;
  healthy: boolean;
}

export function isStaleAt(
  lastEventAt: string | null | undefined,
  nowMs: number,
  staleAfterHours: number,
): boolean {
  if (!lastEventAt) return true;
  const at = new Date(lastEventAt).getTime();
  if (Number.isNaN(at)) return true;
  return nowMs - at > staleAfterHours * 60 * 60 * 1000;
}

async function getLatestEventAt(env: Env): Promise<string | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT MAX(occurred_at) AS last_event_at FROM door_events`,
    ).first<{ last_event_at: string | null }>();
    if (row?.last_event_at) return row.last_event_at;

    const doorRow = await env.GARAGE_DB.prepare(
      `SELECT MAX(updated_at) AS last_updated FROM doors`,
    ).first<{ last_updated: string | null }>();
    return doorRow?.last_updated ?? null;
  } catch {
    return null;
  }
}

export async function buildDashboard(env: Env, nowMs = Date.now()): Promise<DashboardResponse> {
  const { staleAfterHours } = loadConfig(env);
  const { allDoorData } = await loadAllDoors(env);
  const globalLastEventAt = await getLatestEventAt(env);

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

    const lastEventAt = door.history[0]?.createdAt || door.state.createdAt || null;

    return {
      id: door.key,
      name: door.name,
      status: door.state.value,
      stateSince: door.state.createdAt,
      durationSeconds,
      durationText,
      lastEventAt,
      stale: isStaleAt(lastEventAt, nowMs, staleAfterHours),
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

  const openCount = doors.filter((door) => door.status === 'OPEN').length;
  const stale = isStaleAt(globalLastEventAt, nowMs, staleAfterHours);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    doors,
    recentEvents: recentEvents.slice(0, 10),
    lastEventAt: globalLastEventAt,
    staleAfterHours,
    stale,
    openCount,
    healthy: !stale && openCount === 0,
  };
}
