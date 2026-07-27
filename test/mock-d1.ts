import { vi } from 'vitest';

type Row = Record<string, unknown>;

interface DbState {
  doors: Map<string, Row>;
  door_events: Row[];
  alert_config: Row | null;
  alert_state: Map<string, Row>;
  rate_limits: Map<string, Row>;
  ops_events: Row[];
  nextEventId: number;
  nextOpsId: number;
}

function createState(): DbState {
  return {
    doors: new Map(),
    door_events: [],
    alert_config: null,
    alert_state: new Map(),
    rate_limits: new Map(),
    ops_events: [],
    nextEventId: 1,
    nextOpsId: 1,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function d1Result(changes: number, lastRowId = 0): D1Result {
  return {
    success: true,
    meta: {
      changes,
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: lastRowId,
      changed_db: changes > 0,
    },
  } as D1Result;
}

export function createMockD1(state = createState()) {
  const prepare = vi.fn((sql: string) => {
    const normalized = normalizeSql(sql);
    let bound: unknown[] = [];

    const runMutation = (): D1Result => {
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
        const [doorId, status, occurredAt, receivedAt, messageIdHash, source] = bound as [
          string,
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
            received_at: receivedAt,
            message_id_hash: messageIdHash,
            source,
          });
          changes = 1;
        }
      } else if (normalized.startsWith('INSERT INTO door_events')) {
        const doorId = String(bound[0]);
        const status = String(bound[1]);
        const occurredAt = String(bound[2]);
        const receivedAt = String(bound[3]);
        const source = String(bound[bound.length - 1]);
        state.door_events.push({
          id: state.nextEventId++,
          door_id: doorId,
          status,
          occurred_at: occurredAt,
          received_at: receivedAt,
          message_id_hash: null,
          source,
        });
        changes = 1;
      } else if (normalized.startsWith('UPDATE doors')) {
        const status = String(bound[0]);
        const stateSince = bound[1] as string | null;
        const updatedAt = String(bound[2]);
        const id = String(bound[3]);
        const eventTime = String(bound[4]);
        const door = state.doors.get(id);
        if (door) {
          const currentUpdated = door.updated_at == null ? null : String(door.updated_at);
          const chronologyOk = currentUpdated === null || currentUpdated <= eventTime;
          let existsOk = true;
          if (normalized.includes('EXISTS')) {
            const messageIdHash = String(bound[5]);
            const occurredAt = String(bound[6]);
            existsOk = state.door_events.some(
              (event) =>
                event.message_id_hash === messageIdHash && event.occurred_at === occurredAt,
            );
          }
          if (chronologyOk && existsOk) {
            door.current_status = status;
            door.state_since = stateSince;
            door.updated_at = updatedAt;
            changes = 1;
          }
        }
      } else if (normalized.startsWith('DELETE FROM alert_state')) {
        const doorId = String(bound[0]);
        if (normalized.includes('EXISTS')) {
          const id = String(bound[1]);
          const status = String(bound[2]);
          const updatedAt = String(bound[3]);
          const door = state.doors.get(id);
          const matches =
            door && door.current_status === status && String(door.updated_at ?? '') === updatedAt;
          changes = matches && state.alert_state.delete(doorId) ? 1 : 0;
        } else {
          changes = state.alert_state.delete(doorId) ? 1 : 0;
        }
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
      } else if (
        normalized.startsWith('INSERT INTO rate_limits') &&
        normalized.includes('RETURNING count')
      ) {
        const [bucket, windowId] = bound as [string, string];
        const key = `${bucket}:${windowId}`;
        const existing = state.rate_limits.get(key);
        if (existing) {
          existing.count = Number(existing.count) + 1;
        } else {
          state.rate_limits.set(key, { bucket, window_id: windowId, count: 1 });
        }
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
      } else if (normalized.startsWith('DELETE FROM rate_limits')) {
        const cutoff = Number(bound[0]);
        let removed = 0;
        for (const [key, row] of [...state.rate_limits.entries()]) {
          if (Number(row.window_id) < cutoff) {
            state.rate_limits.delete(key);
            removed += 1;
          }
        }
        changes = removed;
      } else if (normalized.startsWith('DELETE FROM door_events WHERE occurred_at')) {
        const cutoff = String(bound[0]);
        const before = state.door_events.length;
        state.door_events = state.door_events.filter(
          (event) => String(event.occurred_at) >= cutoff,
        );
        changes = before - state.door_events.length;
      } else if (normalized.startsWith('INSERT INTO ops_events')) {
        const [occurredAt, kind, doorId, detail] = bound as [
          string,
          string,
          string | null,
          string | null,
        ];
        state.ops_events.push({
          id: state.nextOpsId++,
          occurred_at: occurredAt,
          kind,
          door_id: doorId,
          detail,
        });
        changes = 1;
      } else if (normalized.startsWith('DELETE FROM ops_events WHERE occurred_at')) {
        const cutoff = String(bound[0]);
        const before = state.ops_events.length;
        state.ops_events = state.ops_events.filter((event) => String(event.occurred_at) >= cutoff);
        changes = before - state.ops_events.length;
      }

      return d1Result(changes, state.nextEventId - 1);
    };

    const stmt = {
      bind: vi.fn((...args: unknown[]) => {
        bound = args;
        return stmt;
      }),
      first: vi.fn(async <T>(): Promise<T | null> => {
        if (normalized.startsWith('SELECT 1 AS ok')) {
          return { ok: 1 } as T;
        }
        if (
          normalized.includes('MAX(occurred_at) AS last_email_at') &&
          normalized.includes("source = 'email'") &&
          normalized.includes('door_id = ?')
        ) {
          const doorId = String(bound[0]);
          const emails = state.door_events.filter(
            (event) => event.door_id === doorId && event.source === 'email',
          );
          if (emails.length === 0) return { last_email_at: null } as T;
          const last = [...emails].sort((a, b) =>
            String(b.occurred_at).localeCompare(String(a.occurred_at)),
          )[0];
          return { last_email_at: last.occurred_at } as T;
        }
        if (
          normalized.includes('MAX(occurred_at) AS last_email_at') &&
          normalized.includes("source = 'email'")
        ) {
          const emails = state.door_events.filter((event) => event.source === 'email');
          if (emails.length === 0) return { last_email_at: null } as T;
          const last = [...emails].sort((a, b) =>
            String(b.occurred_at).localeCompare(String(a.occurred_at)),
          )[0];
          return { last_email_at: last.occurred_at } as T;
        }
        if (normalized.includes('MAX(occurred_at) AS last_event_at FROM door_events')) {
          if (state.door_events.length === 0) return { last_event_at: null } as T;
          const last = [...state.door_events].sort((a, b) =>
            String(b.occurred_at).localeCompare(String(a.occurred_at)),
          )[0];
          return { last_event_at: last.occurred_at } as T;
        }
        if (normalized.includes('MAX(updated_at) AS last_updated FROM doors')) {
          if (state.doors.size === 0) return { last_updated: null } as T;
          let max: string | null = null;
          for (const door of state.doors.values()) {
            const updated = String(door.updated_at ?? '');
            if (!max || updated > max) max = updated;
          }
          return { last_updated: max } as T;
        }
        if (
          normalized.includes('FROM ops_events') &&
          normalized.includes('WHERE kind = ?') &&
          normalized.includes('ORDER BY occurred_at DESC')
        ) {
          const kind = String(bound[0]);
          const match = state.ops_events
            .filter((event) => event.kind === kind)
            .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))[0];
          if (!match) return null;
          return {
            occurred_at: match.occurred_at,
            door_id: match.door_id ?? null,
            detail: match.detail ?? null,
          } as T;
        }
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
        if (
          normalized.startsWith('INSERT INTO rate_limits') &&
          normalized.includes('RETURNING count')
        ) {
          runMutation();
          const key = `${bound[0]}:${bound[1]}`;
          const row = state.rate_limits.get(key);
          return { count: Number(row?.count ?? 0) } as T;
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
            .sort((a, b) => {
              const byTime = String(b.occurred_at).localeCompare(String(a.occurred_at));
              if (byTime !== 0) return byTime;
              return Number(b.id) - Number(a.id);
            })
            .slice(0, limit)
            .map((event) => ({ status: event.status, occurred_at: event.occurred_at }));
          return { results: rows as T[] };
        }
        return { results: [] };
      }),
      run: vi.fn(async (): Promise<D1Result> => runMutation()),
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
