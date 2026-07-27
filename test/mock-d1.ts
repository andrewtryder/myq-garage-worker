import { vi } from 'vitest';

type Row = Record<string, unknown>;

interface DbState {
  doors: Map<string, Row>;
  door_events: Row[];
  alert_config: Row | null;
  alert_state: Map<string, Row>;
  rate_limits: Map<string, Row>;
  nextEventId: number;
}

function createState(): DbState {
  return {
    doors: new Map(),
    door_events: [],
    alert_config: null,
    alert_state: new Map(),
    rate_limits: new Map(),
    nextEventId: 1,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export function createMockD1(state = createState()) {
  const prepare = vi.fn((sql: string) => {
    const normalized = normalizeSql(sql);
    let bound: unknown[] = [];

    const stmt = {
      bind: vi.fn((...args: unknown[]) => {
        bound = args;
        return stmt;
      }),
      first: vi.fn(async <T>(): Promise<T | null> => {
        if (normalized.startsWith('SELECT current_status, state_since FROM doors')) {
          const door = state.doors.get(String(bound[0]));
          if (!door) return null;
          return {
            current_status: door.current_status,
            state_since: door.state_since,
          } as T;
        }
        if (normalized.startsWith('SELECT open_since, last_alert_sent_at FROM alert_state')) {
          const latch = state.alert_state.get(String(bound[0]));
          return (latch as T) ?? null;
        }
        if (normalized.startsWith('SELECT webhook_url, threshold_minutes')) {
          return (state.alert_config as T) ?? null;
        }
        if (normalized.startsWith('SELECT count FROM rate_limits')) {
          const key = `${bound[0]}:${bound[1]}`;
          const row = state.rate_limits.get(key);
          return (row as T) ?? null;
        }
        return null;
      }),
      all: vi.fn(async <T>(): Promise<{ results: T[] }> => {
        if (
          normalized.includes('FROM door_events') &&
          normalized.includes('ORDER BY occurred_at DESC')
        ) {
          const doorId = String(bound[0]);
          const limit = Number(bound[1] ?? 10);
          const rows = state.door_events
            .filter((event) => event.door_id === doorId)
            .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
            .slice(0, limit)
            .map((event) => ({ status: event.status, occurred_at: event.occurred_at }));
          return { results: rows as T[] };
        }
        return { results: [] };
      }),
      run: vi.fn(async (): Promise<D1Result> => {
        let changes = 0;

        if (normalized.startsWith('INSERT INTO doors')) {
          const [id, name, updatedAt] = bound as string[];
          const existing = state.doors.get(id);
          if (existing) {
            existing.name = name;
          } else {
            state.doors.set(id, {
              id,
              name,
              current_status: 'UNKNOWN',
              state_since: null,
              updated_at: updatedAt,
            });
          }
          changes = 1;
        } else if (normalized.startsWith('INSERT OR IGNORE INTO door_events')) {
          const [doorId, status, occurredAt, messageIdHash, source] = bound as [
            string,
            string,
            string,
            string | null,
            string,
          ];
          if (
            messageIdHash &&
            state.door_events.some((event) => event.message_id_hash === messageIdHash)
          ) {
            changes = 0;
          } else {
            state.door_events.push({
              id: state.nextEventId++,
              door_id: doorId,
              status,
              occurred_at: occurredAt,
              message_id_hash: messageIdHash,
              source,
            });
            changes = 1;
          }
        } else if (normalized.startsWith('INSERT INTO door_events')) {
          const doorId = String(bound[0]);
          const status = String(bound[1]);
          const occurredAt = String(bound[2]);
          const source = String(bound[bound.length - 1]);
          state.door_events.push({
            id: state.nextEventId++,
            door_id: doorId,
            status,
            occurred_at: occurredAt,
            message_id_hash: null,
            source,
          });
          changes = 1;
        } else if (normalized.startsWith('UPDATE doors')) {
          const [status, stateSince, updatedAt, id] = bound as [
            string,
            string | null,
            string,
            string,
          ];
          const door = state.doors.get(id);
          if (door) {
            door.current_status = status;
            door.state_since = stateSince;
            door.updated_at = updatedAt;
            changes = 1;
          }
        } else if (normalized.startsWith('DELETE FROM alert_state')) {
          changes = state.alert_state.delete(String(bound[0])) ? 1 : 0;
        } else if (normalized.startsWith('INSERT INTO alert_state')) {
          const [doorId, openSince, lastAlert] = bound as [string, string, string];
          state.alert_state.set(doorId, {
            door_id: doorId,
            open_since: openSince,
            last_alert_sent_at: lastAlert,
          });
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO alert_config')) {
          const [webhookUrl, threshold, reminder, method, updatedAt] = bound as [
            string,
            number,
            number | null,
            string,
            string,
          ];
          state.alert_config = {
            webhook_url: webhookUrl,
            threshold_minutes: threshold,
            reminder_minutes: reminder,
            method,
            updated_at: updatedAt,
          };
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO rate_limits')) {
          const [bucket, windowId] = bound as [string, string];
          const key = `${bucket}:${windowId}`;
          const existing = state.rate_limits.get(key);
          if (existing) {
            existing.count = Number(existing.count) + 1;
          } else {
            state.rate_limits.set(key, { bucket, window_id: windowId, count: 1 });
          }
          changes = 1;
        } else if (normalized.startsWith('DELETE FROM door_events WHERE occurred_at')) {
          const cutoff = String(bound[0]);
          const before = state.door_events.length;
          state.door_events = state.door_events.filter(
            (event) => String(event.occurred_at) >= cutoff,
          );
          changes = before - state.door_events.length;
        }

        return {
          success: true,
          meta: {
            changes,
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: changes,
            last_row_id: state.nextEventId - 1,
            changed_db: changes > 0,
          },
        } as D1Result;
      }),
    };

    return stmt;
  });

  const mockDb = {
    prepare,
    batch: vi.fn(async (statements: { run: () => Promise<D1Result> }[]) => {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    }),
    exec: vi.fn(async () => ({ count: 0, duration: 0 })),
  };

  return { state, mockDb };
}
