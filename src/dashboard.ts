import { loadConfig } from './config';
import { DoorStatus, Env } from './types';
import { loadAllDoors } from './doors';
import { formatDuration } from './format';
import { getLatestEmailAtForDoor } from './storage';
import { getDoorAlertSettings } from './alert-config';

export interface DashboardDoor {
  id: string;
  name: string;
  status: DoorStatus;
  stateSince: string;
  durationSeconds: number | null;
  durationText: string | null;
  lastEmailAt: string | null;
  lastEventAt: string | null;
  stale: boolean;
  alertsEnabled: boolean;
  notifyAfterMinutes: number;
  reminderIntervalMinutes: number | null;
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
  /** @deprecated Prefer lastEmailReceivedAt — kept for compatibility */
  lastEventAt: string | null;
  lastEmailReceivedAt: string | null;
  lastStateChangeAt: string | null;
  staleAfterHours: number;
  /** Email-pipeline staleness (any door missing recent email). */
  stale: boolean;
  emailPipelineStale: boolean;
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

async function getLatestEmailReceivedAt(env: Env): Promise<string | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT MAX(occurred_at) AS last_email_at FROM door_events WHERE source = 'email'`,
    ).first<{ last_email_at: string | null }>();
    return row?.last_email_at ?? null;
  } catch {
    return null;
  }
}

async function getLatestStateChangeAt(env: Env): Promise<string | null> {
  try {
    const row = await env.GARAGE_DB.prepare(
      `SELECT MAX(occurred_at) AS last_event_at FROM door_events`,
    ).first<{ last_event_at: string | null }>();
    return row?.last_event_at ?? null;
  } catch {
    return null;
  }
}

export async function buildDashboard(env: Env, nowMs = Date.now()): Promise<DashboardResponse> {
  const { staleAfterHours } = loadConfig(env);
  const { allDoorData } = await loadAllDoors(env);
  const [lastEmailReceivedAt, lastStateChangeAt] = await Promise.all([
    getLatestEmailReceivedAt(env),
    getLatestStateChangeAt(env),
  ]);

  const doors: DashboardDoor[] = await Promise.all(
    allDoorData.map(async (door) => {
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

      const lastEmailAt = await getLatestEmailAtForDoor(env, door.key);
      const lastEventAt = door.history[0]?.createdAt || door.state.createdAt || null;
      const alertSettings = await getDoorAlertSettings(env, door.key);

      return {
        id: door.key,
        name: door.name,
        status: door.state.value,
        stateSince: door.state.createdAt,
        durationSeconds,
        durationText,
        lastEmailAt,
        lastEventAt,
        stale: isStaleAt(lastEmailAt, nowMs, staleAfterHours),
        alertsEnabled: alertSettings?.alertsEnabled ?? false,
        notifyAfterMinutes: alertSettings?.notifyAfterMinutes ?? 30,
        reminderIntervalMinutes: alertSettings?.reminderIntervalMinutes ?? null,
      };
    }),
  );

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
  const stale = doors.length === 0 || doors.some((door) => door.stale);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    doors,
    recentEvents: recentEvents.slice(0, 10),
    lastEventAt: lastEmailReceivedAt,
    lastEmailReceivedAt,
    lastStateChangeAt,
    staleAfterHours,
    stale,
    emailPipelineStale: stale,
    openCount,
    healthy: !stale && openCount === 0,
  };
}
