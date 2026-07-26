import { Env } from './types';
import { claimMessageId, saveDoorState } from './storage';
import { loadConfig } from './config';
import {
  hasFailedEmailAuthentication,
  isAllowedRecipient,
  isMyQEnvelopeSender,
  mapActionToStatus,
  parseMyQSubject,
  resolveDoorKey,
} from './email-parser';
import { renderStatusPage } from './status-page';
import { runOpenDoorAlerts, testAlert } from './alerts';
import {
  getAlertConfig,
  resolveAlertConfigFromBody,
  saveAlertConfig,
  toPublicAlertConfig,
} from './alert-config';
import { buildHaDevices, loadAllDoors } from './doors';
import { isApiKeyAuthorized, routeRequiresApiKey } from './auth';
import { consumeRateLimit } from './rate-limit';
import {
  htmlResponse,
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
  '/simulate': ['POST'],
  '/alert-config': ['POST'],
  '/test-alert': ['POST'],
};

function matchRoute(pathname: string): string | null {
  if (pathname in ROUTE_METHODS) return pathname;
  return null;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const sender = typeof message.from === 'string' ? message.from : '';
      if (!isMyQEnvelopeSender(sender)) {
        message.setReject('Unsupported sender');
        return;
      }

      const { allowedEmailTo } = loadConfig(env);
      const recipient = typeof message.to === 'string' ? message.to : '';
      if (!isAllowedRecipient(recipient, allowedEmailTo)) {
        message.setReject('Unsupported recipient');
        return;
      }

      if (hasFailedEmailAuthentication(message.headers.get('authentication-results'))) {
        message.setReject('Failed email authentication');
        return;
      }

      const messageId = message.headers.get('message-id');
      if (await claimMessageId(env, messageId)) {
        console.log('Duplicate Message-ID, skipping');
        return;
      }

      const subject = message.headers.get('subject') || '';
      console.log('Subject:', subject);

      const parsed = parseMyQSubject(subject);
      if (!parsed) {
        console.log('Subject did not match MyQ pattern');
        return;
      }

      const { deviceName, action } = parsed;
      const doorKey = resolveDoorKey(deviceName, env);
      if (!doorKey) {
        console.log('Unknown device name:', deviceName);
        return;
      }

      const value = mapActionToStatus(action);
      await saveDoorState(env, doorKey, value);
    } catch (err) {
      console.error('Error handling MyQ email:', err);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const config = await getAlertConfig(env);
    if (!config) {
      console.log('No alert webhook configured, skipping scheduled alert check.');
      return;
    }

    try {
      await runOpenDoorAlerts(env);
    } catch (err) {
      console.error('Error in scheduled handler:', err);
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

      if (request.method === 'POST' && url.pathname === '/simulate') {
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
        await saveDoorState(env, doorKey, value);

        return jsonResponse({ success: true, door: deviceName, state: value });
      }

      if (request.method === 'POST' && url.pathname === '/alert-config') {
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
          return jsonResponse({ success: true, config: toPublicAlertConfig(config) });
        } catch {
          return jsonResponse({ error: 'Invalid alert configuration' }, 400);
        }
      }

      if (request.method === 'POST' && url.pathname === '/test-alert') {
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
          typeof body.doorName === 'string' && body.doorName.trim()
            ? body.doorName.trim()
            : undefined;
        const result = await testAlert(config, doorName);

        return jsonResponse({ result });
      }

      if (request.method === 'GET' && url.pathname === '/devices') {
        const { allDoorData } = await loadAllDoors(env);
        const devices = buildHaDevices(allDoorData);
        return jsonResponse(devices);
      }

      // GET /
      const { allDoorData, doors, combinedHistory } = await loadAllDoors(env);

      if (url.searchParams.get('json') === 'true') {
        return jsonResponse({ doors, history: combinedHistory });
      }

      const openDoorNames = allDoorData
        .filter((door) => door.state.value === 'OPEN')
        .map((door) => door.name);

      const alertConfig = await getAlertConfig(env);

      const html = renderStatusPage(doors, combinedHistory, {
        doorNames: allDoorData.map((door) => door.name),
        openDoorNames,
        alertConfig,
      });

      return htmlResponse(html);
    } catch (err) {
      console.error('Error handling fetch request:', err);
      return textResponse('Error rendering status page', 500);
    }
  },
};
