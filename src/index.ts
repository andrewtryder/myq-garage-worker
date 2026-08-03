import { Env } from './types';
import { saveDoorState, pruneOldEvents } from './storage';
import { loadConfig } from './config';
import {
  hasFailedEmailAuthentication,
  isAcceptableMyQSender,
  isAllowedRecipient,
  mapActionToStatus,
  normalizeMaybeAddress,
  parseAddressFromHeader,
  parseMyQSubject,
  resolveDoorKey,
} from './email-parser';
import { resolveOrderingTime } from './email-time';
import { runOpenDoorAlerts, testAlert } from './alerts';
import {
  getAlertConfig,
  listDoorAlertSettings,
  resolveAlertConfigFromBody,
  saveAlertConfig,
  saveDoorAlertSettingsBatch,
  toPublicAlertConfig,
  updateDoorAlertSettings,
} from './alert-config';
import { buildHaDevices, loadAllDoors } from './doors';
import { buildDashboard } from './dashboard';
import { buildHealth } from './health';
import { recordOpsEvent, pruneOpsEvents } from './ops';
import { isApiKeyAuthorized, routeRequiresApiKey } from './auth';
import { consumeRateLimit, pruneRateLimits } from './rate-limit';
import {
  jsonResponse,
  methodNotAllowedResponse,
  notFoundResponse,
  readJsonBody,
  textResponse,
} from './http';

export type { Env };

const ROUTE_METHODS: Record<string, string[]> = {
  '/': ['GET'],
  '/devices': ['GET'],
  '/health': ['GET'],
  '/api/dashboard': ['GET'],
  '/api/alert-config': ['GET', 'POST'],
  '/api/test-alert': ['POST'],
  '/api/simulate': ['POST'],
  '/api/doors/:id/alerts': ['POST'],
  // Legacy aliases (prefer /api/*)
  '/simulate': ['POST'],
  '/alert-config': ['POST'],
  '/test-alert': ['POST'],
};

function matchDoorAlertsRoute(pathname: string): string | null {
  const match = pathname.match(/^\/api\/doors\/([^/]+)\/alerts$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function matchRoute(pathname: string): string | null {
  if (pathname in ROUTE_METHODS) return pathname;
  if (matchDoorAlertsRoute(pathname)) return '/api/doors/:id/alerts';
  return null;
}

async function handleSimulate(request: Request, env: Env): Promise<Response> {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.value as {
    subject?: string;
    deviceName?: string;
    action?: string;
  };

  let deviceName = body.deviceName;
  let action = body.action;

  if (body.subject) {
    const parsed = parseMyQSubject(body.subject);
    if (parsed) {
      deviceName = parsed.deviceName;
      action = parsed.action;
    }
  }

  if (!deviceName || !action) {
    return jsonResponse({ error: 'Missing deviceName or action (or valid subject)' }, 400);
  }

  const doorKey = resolveDoorKey(deviceName, env);
  if (!doorKey) {
    return jsonResponse({ error: `Unknown device name: ${deviceName}` }, 404);
  }

  const value = mapActionToStatus(action);
  const result = await saveDoorState(env, doorKey, value, {
    source: 'simulate',
    doorName: deviceName,
  });
  if (result.applied) {
    await recordOpsEvent(env, 'door_change', {
      doorId: doorKey,
      detail: `${deviceName} → ${value} (simulate)`,
    });
  }

  return jsonResponse({
    success: true,
    door: deviceName,
    state: result.state.value,
    applied: result.applied,
  });
}

async function handleAlertConfigGet(env: Env): Promise<Response> {
  const [config, doors] = await Promise.all([getAlertConfig(env), listDoorAlertSettings(env)]);
  return jsonResponse({
    config: toPublicAlertConfig(config),
    doors,
    doorNames: Object.keys(loadConfig(env).garageDoors),
  });
}

async function handleAlertConfigPost(request: Request, env: Env): Promise<Response> {
  const rate = await consumeRateLimit(env, 'alert-config');
  if (!rate.allowed) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const body = parsedBody.value as Record<string, unknown>;
    const saved = await getAlertConfig(env);
    const merged = resolveAlertConfigFromBody(body, saved);
    if (!merged) {
      return jsonResponse({ error: 'Invalid alert configuration' }, 400);
    }
    const config = await saveAlertConfig(env, merged);

    let doors = await listDoorAlertSettings(env);
    if (Array.isArray(body.doors)) {
      const batch: Array<{
        doorId: string;
        alertsEnabled: boolean;
        notifyAfterMinutes: number;
        reminderIntervalMinutes: number | null;
      }> = [];
      for (const item of body.doors) {
        if (typeof item !== 'object' || item === null) continue;
        const row = item as Record<string, unknown>;
        if (typeof row.doorId !== 'string') continue;
        const notifyAfterMinutes =
          typeof row.notifyAfterMinutes === 'number'
            ? row.notifyAfterMinutes
            : parseInt(String(row.notifyAfterMinutes ?? '30'), 10);
        if (isNaN(notifyAfterMinutes) || notifyAfterMinutes <= 0) {
          return jsonResponse({ error: 'Invalid door alert settings' }, 400);
        }
        let reminderIntervalMinutes: number | null = null;
        if (
          row.reminderIntervalMinutes !== undefined &&
          row.reminderIntervalMinutes !== null &&
          row.reminderIntervalMinutes !== ''
        ) {
          const parsed =
            typeof row.reminderIntervalMinutes === 'number'
              ? row.reminderIntervalMinutes
              : parseInt(String(row.reminderIntervalMinutes), 10);
          if (isNaN(parsed) || parsed < 0) {
            return jsonResponse({ error: 'Invalid door alert settings' }, 400);
          }
          reminderIntervalMinutes = parsed === 0 ? null : parsed;
        }
        batch.push({
          doorId: row.doorId,
          alertsEnabled: Boolean(row.alertsEnabled),
          notifyAfterMinutes,
          reminderIntervalMinutes,
        });
      }
      doors = await saveDoorAlertSettingsBatch(env, batch);
    }

    return jsonResponse({
      success: true,
      config: toPublicAlertConfig(config),
      doors,
    });
  } catch {
    return jsonResponse({ error: 'Invalid alert configuration' }, 400);
  }
}

async function handleDoorAlertsPost(request: Request, env: Env, doorId: string): Promise<Response> {
  const rate = await consumeRateLimit(env, 'alert-config');
  if (!rate.allowed) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.value as Record<string, unknown>;
  const patch: {
    alertsEnabled?: boolean;
    notifyAfterMinutes?: number;
    reminderIntervalMinutes?: number | null;
  } = {};

  if (typeof body.enabled === 'boolean') patch.alertsEnabled = body.enabled;
  if (typeof body.alertsEnabled === 'boolean') patch.alertsEnabled = body.alertsEnabled;
  if (body.notifyAfterMinutes !== undefined) {
    const n =
      typeof body.notifyAfterMinutes === 'number'
        ? body.notifyAfterMinutes
        : parseInt(String(body.notifyAfterMinutes), 10);
    if (isNaN(n) || n <= 0) {
      return jsonResponse({ error: 'Invalid notifyAfterMinutes' }, 400);
    }
    patch.notifyAfterMinutes = n;
  }
  if (body.reminderIntervalMinutes !== undefined) {
    if (body.reminderIntervalMinutes === null || body.reminderIntervalMinutes === '') {
      patch.reminderIntervalMinutes = null;
    } else {
      const n =
        typeof body.reminderIntervalMinutes === 'number'
          ? body.reminderIntervalMinutes
          : parseInt(String(body.reminderIntervalMinutes), 10);
      if (isNaN(n) || n < 0) {
        return jsonResponse({ error: 'Invalid reminderIntervalMinutes' }, 400);
      }
      patch.reminderIntervalMinutes = n === 0 ? null : n;
    }
  }

  if (
    patch.alertsEnabled === undefined &&
    patch.notifyAfterMinutes === undefined &&
    patch.reminderIntervalMinutes === undefined
  ) {
    return jsonResponse({ error: 'No alert fields to update' }, 400);
  }

  try {
    const door = await updateDoorAlertSettings(env, doorId, patch);
    if (!door) {
      return jsonResponse({ error: 'Unknown door id' }, 404);
    }
    return jsonResponse({ success: true, door });
  } catch {
    return jsonResponse({ error: 'Failed to update door alerts' }, 400);
  }
}

async function handleTestAlert(request: Request, env: Env): Promise<Response> {
  const rate = await consumeRateLimit(env, 'test-alert');
  if (!rate.allowed) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.value as Record<string, unknown>;
  const saved = await getAlertConfig(env);
  const config = resolveAlertConfigFromBody(body, saved);

  if (!config) {
    return jsonResponse({ error: 'Invalid alert configuration' }, 400);
  }

  const doorName =
    typeof body.doorName === 'string' && body.doorName.trim() ? body.doorName.trim() : undefined;
  const result = await testAlert(config, doorName);

  if (result.sent) {
    await recordOpsEvent(env, 'webhook_ok', { detail: `test-alert ${result.door}` });
  } else {
    await recordOpsEvent(env, 'webhook_fail', {
      detail: result.error || result.skippedReason || `HTTP ${result.webhookStatus ?? '?'}`,
    });
  }

  return jsonResponse({ result });
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const sender = typeof message.from === 'string' ? message.from : '';
      const headerFrom = message.headers.get('from');
      const subject = message.headers.get('subject') || '';
      const returnPath = message.headers.get('return-path');
      const { allowedEmailTo, allowedForwardFrom, eventTimeSkewHours } = loadConfig(env);

      const senderOk =
        isAcceptableMyQSender({
          envelopeFrom: sender,
          headerFrom,
          allowedForwardFrom,
          subject,
        }) ||
        // Some forwarders put the account address on Return-Path while rewriting MAIL FROM.
        (Boolean(allowedForwardFrom) &&
          isAcceptableMyQSender({
            envelopeFrom: returnPath ?? '',
            headerFrom,
            allowedForwardFrom,
            subject,
          }));

      if (!senderOk) {
        // Silent drop: avoid SMTP 555 bounces (e.g. Gmail CAF) for probes / misconfigured forwards.
        const envelope = normalizeMaybeAddress(sender) || sender.trim() || '(empty)';
        const header = parseAddressFromHeader(headerFrom) || headerFrom?.trim() || '(none)';
        const rp = normalizeMaybeAddress(returnPath) || returnPath?.trim() || '(none)';
        console.log('Unsupported sender, dropping:', { envelope, header, returnPath: rp });
        await recordOpsEvent(env, 'email_reject', {
          detail: `unsupported_sender envelope=${envelope} header=${header} return_path=${rp}`,
        });
        return;
      }

      const recipient = typeof message.to === 'string' ? message.to : '';
      if (!isAllowedRecipient(recipient, allowedEmailTo)) {
        message.setReject('Unsupported recipient');
        await recordOpsEvent(env, 'email_reject', { detail: 'unsupported_recipient' });
        return;
      }

      if (hasFailedEmailAuthentication(message.headers.get('authentication-results'))) {
        message.setReject('Failed email authentication');
        await recordOpsEvent(env, 'email_reject', { detail: 'auth_fail' });
        return;
      }

      const messageId = message.headers.get('message-id');
      console.log('Subject:', subject);

      const parsed = parseMyQSubject(subject);
      if (!parsed) {
        console.log('Subject did not match MyQ pattern');
        await recordOpsEvent(env, 'email_reject', { detail: 'subject_mismatch' });
        return;
      }

      const { deviceName, action } = parsed;
      const doorKey = resolveDoorKey(deviceName, env);
      if (!doorKey) {
        console.log('Unknown device name:', deviceName);
        await recordOpsEvent(env, 'email_reject', { detail: 'unknown_device' });
        return;
      }

      const value = mapActionToStatus(action);
      const receivedAt = new Date().toISOString();
      const occurredAt = resolveOrderingTime(
        message.headers.get('date'),
        receivedAt,
        eventTimeSkewHours,
      );
      const result = await saveDoorState(env, doorKey, value, {
        messageId,
        source: 'email',
        doorName: deviceName,
        occurredAt,
      });
      if (result.duplicate) {
        console.log('Duplicate Message-ID, skipping');
        await recordOpsEvent(env, 'email_ok', {
          doorId: doorKey,
          detail: 'duplicate_message_id',
        });
        return;
      }

      await recordOpsEvent(env, 'email_ok', {
        doorId: doorKey,
        detail: result.applied
          ? `${deviceName} → ${value}`
          : `${deviceName} → ${value} received; not applied because a newer state exists`,
      });
      if (result.applied) {
        await recordOpsEvent(env, 'door_change', {
          doorId: doorKey,
          detail: `${deviceName} → ${value}`,
        });
      }
    } catch (err) {
      console.error('Error handling MyQ email:', err);
      await recordOpsEvent(env, 'email_reject', { detail: 'handler_error' });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const pruned = await pruneOldEvents(env);
      if (pruned > 0) {
        console.log(`Pruned ${pruned} door_events older than retention window`);
      }
      await pruneOpsEvents(env);
      await pruneRateLimits(env);
    } catch (err) {
      console.error('Error pruning old events:', err);
    }

    const config = await getAlertConfig(env);
    if (!config) {
      console.log('No alert webhook configured, skipping scheduled alert check.');
      await recordOpsEvent(env, 'cron_alerts', { detail: 'skipped_no_config' });
      return;
    }

    try {
      const results = await runOpenDoorAlerts(env);
      const sent = results.filter((result) => result.sent).length;
      const failed = results.filter(
        (result) => !result.sent && (result.error || result.webhookStatus),
      ).length;
      await recordOpsEvent(env, 'cron_alerts', {
        detail: `sent=${sent} failed=${failed} checked=${results.length}`,
      });
      if (sent > 0) {
        await recordOpsEvent(env, 'webhook_ok', { detail: `cron sent=${sent}` });
      }
      if (failed > 0) {
        await recordOpsEvent(env, 'webhook_fail', { detail: `cron failed=${failed}` });
      }
    } catch (err) {
      console.error('Error in scheduled handler:', err);
      await recordOpsEvent(env, 'cron_alerts', { detail: 'handler_error' });
    }
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const route = matchRoute(url.pathname);

      if (!route) {
        return notFoundResponse();
      }

      const allowed = ROUTE_METHODS[route];
      if (!allowed.includes(request.method)) {
        return methodNotAllowedResponse(allowed);
      }

      if (routeRequiresApiKey(request) && !isApiKeyAuthorized(request, env)) {
        return textResponse('Unauthorized', 401);
      }

      if (request.method === 'POST' && (route === '/api/simulate' || route === '/simulate')) {
        return handleSimulate(request, env);
      }

      if (request.method === 'GET' && route === '/api/alert-config') {
        return handleAlertConfigGet(env);
      }

      if (
        request.method === 'POST' &&
        (route === '/api/alert-config' || route === '/alert-config')
      ) {
        return handleAlertConfigPost(request, env);
      }

      if (request.method === 'POST' && (route === '/api/test-alert' || route === '/test-alert')) {
        return handleTestAlert(request, env);
      }

      if (request.method === 'POST' && route === '/api/doors/:id/alerts') {
        const doorId = matchDoorAlertsRoute(url.pathname);
        if (!doorId) return notFoundResponse();
        return handleDoorAlertsPost(request, env, doorId);
      }

      if (request.method === 'GET' && route === '/api/dashboard') {
        return jsonResponse(await buildDashboard(env));
      }

      if (request.method === 'GET' && route === '/health') {
        const health = await buildHealth(env);
        return jsonResponse(health, health.d1Ok ? 200 : 503);
      }

      if (request.method === 'GET' && route === '/devices') {
        const { allDoorData } = await loadAllDoors(env);
        const devices = buildHaDevices(allDoorData);
        return jsonResponse(devices);
      }

      // GET / — deprecated JSON or static assets
      if (url.searchParams.get('json') === 'true') {
        const { doors, combinedHistory } = await loadAllDoors(env);
        return jsonResponse({ doors, history: combinedHistory });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('Error handling request:', err);
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },
};
