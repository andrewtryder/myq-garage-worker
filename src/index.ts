import { Env } from './types';
import { saveDoorState } from './storage';
import { mapActionToStatus, parseMyQSubject, resolveDoorKey } from './email-parser';
import { renderStatusPage, renderUnlockPage } from './status-page';
import { runOpenDoorAlerts, testAlert } from './alerts';
import { getAlertConfig, resolveAlertConfigFromBody, saveAlertConfig } from './alert-config';
import { buildHaDevices, loadAllDoors, routeRequiresAuth } from './doors';

export type { Env };

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.API_KEY) {
    return true;
  }

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key');
  if (queryKey === env.API_KEY) return true;

  const headerKey = request.headers.get('x-api-key');
  if (headerKey === env.API_KEY) return true;

  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.replace(/^Bearer\s+/i, '').trim() === env.API_KEY) {
    return true;
  }

  return false;
}

function unauthorizedResponse(request: Request, _env: Env): Response {
  const url = new URL(request.url);
  if (
    request.method === 'GET' &&
    url.pathname === '/' &&
    url.searchParams.get('json') !== 'true'
  ) {
    return new Response(renderUnlockPage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response('Unauthorized', { status: 401 });
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const fromHeader = message.headers.get('from') || '';
      if (!fromHeader.toLowerCase().includes('notification@myq.com')) {
        console.log('Not a MyQ email, ignoring');
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
    if (routeRequiresAuth(request, env) && !isAuthorized(request, env)) {
      return unauthorizedResponse(request, env);
    }

    try {
      const url = new URL(request.url);

      if (request.method === 'POST' && url.pathname === '/simulate') {
        try {
          const body = (await request.json()) as {
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
            return new Response(
              JSON.stringify({ error: 'Missing deviceName or action (or valid subject)' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
          }

          const doorKey = resolveDoorKey(deviceName, env);
          if (!doorKey) {
            return new Response(JSON.stringify({ error: `Unknown device name: ${deviceName}` }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const value = mapActionToStatus(action);
          await saveDoorState(env, doorKey, value);

          return new Response(JSON.stringify({ success: true, door: deviceName, state: value }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (request.method === 'POST' && url.pathname === '/alert-config') {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const config = await saveAlertConfig(env, body);
          return new Response(JSON.stringify({ success: true, config }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid alert configuration';
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (request.method === 'POST' && url.pathname === '/test-alert') {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const saved = await getAlertConfig(env);
          const config = resolveAlertConfigFromBody(body, saved);

          if (!config) {
            return new Response(JSON.stringify({ error: 'Webhook URL is required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const doorName =
            typeof body.doorName === 'string' && body.doorName.trim()
              ? body.doorName.trim()
              : undefined;
          const result = await testAlert(config, doorName);

          return new Response(JSON.stringify({ result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      const { allDoorData, doors, combinedHistory } = await loadAllDoors(env);

      if (request.method === 'GET' && url.pathname === '/devices') {
        const devices = buildHaDevices(allDoorData);
        return new Response(JSON.stringify(devices), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const isJson = url.searchParams.get('json') === 'true';

      if (isJson) {
        return new Response(JSON.stringify({ doors, history: combinedHistory }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      const openDoorNames = allDoorData
        .filter((door) => door.state.value === 'OPEN')
        .map((door) => door.name);

      const alertConfig = await getAlertConfig(env);

      const html = renderStatusPage(doors, combinedHistory, {
        doorNames: allDoorData.map((door) => door.name),
        openDoorNames,
        alertConfig,
        apiKeyRequired: !!env.API_KEY,
      });

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (err) {
      console.error('Error handling fetch request:', err);
      return new Response('Error rendering status page', { status: 500 });
    }
  },
};
