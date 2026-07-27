#! /usr/bin/env node
/* global process */
/**
 * One-shot import of production KV garage data into D1.
 *
 * Requires:
 *   KV_NAMESPACE_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 *   GARAGE_DOORS (JSON object)
 *   D1 database myq-garage (migrations already applied)
 *
 * Usage: npm run db:migrate-from-kv
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { loadDotEnv } from './setup-config.js';

loadDotEnv();

function run(cmd, args, { json = false } = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${cmd} ${args.join(' ')} failed`);
  }
  const out = (result.stdout || '').trim();
  if (!json) return out;
  return out ? JSON.parse(out) : null;
}

function d1Exec(sql) {
  run('npx', ['wrangler', 'd1', 'execute', 'myq-garage', '--remote', '--command', sql]);
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Read GARAGE_DOORS from .env without Node loadEnvFile mangling unquoted JSON. */
function readGarageDoors() {
  if (process.env.GARAGE_DOORS) {
    try {
      const parsed = JSON.parse(process.env.GARAGE_DOORS);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* fall through */
    }
  }

  const envPath = path.join(process.cwd(), '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('GARAGE_DOORS='));
  if (!line) throw new Error('GARAGE_DOORS is required');
  let value = line.slice('GARAGE_DOORS='.length).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return JSON.parse(value);
}

async function main() {
  const namespaceId = process.env.KV_NAMESPACE_ID;
  if (!namespaceId) throw new Error('KV_NAMESPACE_ID is required');
  const garageDoors = readGarageDoors();

  console.log('Listing KV keys…');
  const keys = run(
    'npx',
    ['wrangler', 'kv', 'key', 'list', '--namespace-id', namespaceId, '--remote'],
    { json: true },
  );
  const keyNames = (keys || []).map((entry) => entry.name);

  let doorsImported = 0;
  let eventsImported = 0;
  let alertConfigImported = false;
  let latchesImported = 0;

  const now = new Date().toISOString();

  for (const [name, doorId] of Object.entries(garageDoors)) {
    const raw = run('npx', [
      'wrangler',
      'kv',
      'key',
      'get',
      doorId,
      '--namespace-id',
      namespaceId,
      '--remote',
    ]);
    let status = 'UNKNOWN';
    let stateSince = null;
    if (raw && raw !== 'Value not found') {
      try {
        const parsed = JSON.parse(raw);
        status = parsed.value || 'UNKNOWN';
        stateSince = parsed.createdAt || null;
      } catch {
        /* ignore */
      }
    }

    d1Exec(
      `INSERT INTO doors (id, name, current_status, state_since, updated_at) VALUES (${sqlString(doorId)}, ${sqlString(name)}, ${sqlString(status)}, ${sqlString(stateSince)}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, current_status=excluded.current_status, state_since=excluded.state_since, updated_at=excluded.updated_at`,
    );
    doorsImported += 1;

    const historyKeys = keyNames
      .filter((key) => key.startsWith(`eventr:${doorId}:`) || key.startsWith(`event:${doorId}:`))
      .sort()
      .reverse();

    for (const historyKey of historyKeys) {
      const eventRaw = run('npx', [
        'wrangler',
        'kv',
        'key',
        'get',
        historyKey,
        '--namespace-id',
        namespaceId,
        '--remote',
      ]);
      if (!eventRaw || eventRaw === 'Value not found') continue;
      try {
        const parsed = JSON.parse(eventRaw);
        const eventStatus = parsed.value || 'UNKNOWN';
        const occurredAt = parsed.createdAt || now;
        d1Exec(
          `INSERT INTO door_events (door_id, status, occurred_at, message_id_hash, source) VALUES (${sqlString(doorId)}, ${sqlString(eventStatus)}, ${sqlString(occurredAt)}, NULL, 'migration')`,
        );
        eventsImported += 1;
      } catch {
        /* ignore bad event */
      }
    }

    const legacyHistoryKey = `history:${doorId}`;
    if (keyNames.includes(legacyHistoryKey)) {
      const legacyRaw = run('npx', [
        'wrangler',
        'kv',
        'key',
        'get',
        legacyHistoryKey,
        '--namespace-id',
        namespaceId,
        '--remote',
      ]);
      try {
        const arr = JSON.parse(legacyRaw);
        if (Array.isArray(arr)) {
          for (const item of arr) {
            d1Exec(
              `INSERT INTO door_events (door_id, status, occurred_at, message_id_hash, source) VALUES (${sqlString(doorId)}, ${sqlString(item.value || 'UNKNOWN')}, ${sqlString(item.createdAt || now)}, NULL, 'migration')`,
            );
            eventsImported += 1;
          }
        }
      } catch {
        /* ignore */
      }
    }

    const latchKey = `alert-latch:${doorId}`;
    if (keyNames.includes(latchKey)) {
      const latchRaw = run('npx', [
        'wrangler',
        'kv',
        'key',
        'get',
        latchKey,
        '--namespace-id',
        namespaceId,
        '--remote',
      ]);
      try {
        const latch = JSON.parse(latchRaw);
        if (latch.openCreatedAt && latch.lastAlertSentAt) {
          d1Exec(
            `INSERT INTO alert_state (door_id, open_since, last_alert_sent_at) VALUES (${sqlString(doorId)}, ${sqlString(latch.openCreatedAt)}, ${sqlString(latch.lastAlertSentAt)}) ON CONFLICT(door_id) DO UPDATE SET open_since=excluded.open_since, last_alert_sent_at=excluded.last_alert_sent_at`,
          );
          latchesImported += 1;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (keyNames.includes('config:alerts')) {
    const configRaw = run('npx', [
      'wrangler',
      'kv',
      'key',
      'get',
      'config:alerts',
      '--namespace-id',
      namespaceId,
      '--remote',
    ]);
    try {
      const config = JSON.parse(configRaw);
      d1Exec(
        `INSERT INTO alert_config (id, webhook_url, threshold_minutes, reminder_minutes, method, updated_at) VALUES (1, ${sqlString(config.webhookUrl)}, ${Number(config.thresholdMinutes) || 60}, ${config.reminderMinutes == null ? 'NULL' : Number(config.reminderMinutes)}, ${sqlString(config.method || 'POST')}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET webhook_url=excluded.webhook_url, threshold_minutes=excluded.threshold_minutes, reminder_minutes=excluded.reminder_minutes, method=excluded.method, updated_at=excluded.updated_at`,
      );
      alertConfigImported = true;
    } catch {
      /* ignore */
    }
  }

  console.log('Import complete:');
  console.log(`  doors: ${doorsImported}`);
  console.log(`  events: ${eventsImported}`);
  console.log(`  alert_config: ${alertConfigImported}`);
  console.log(`  alert_state: ${latchesImported}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
