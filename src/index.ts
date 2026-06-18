import { Env } from './types';
import { getDoorState, saveDoorState } from './storage';
import { mapActionToStatus, parseMyQSubject, resolveDoorKey } from './email-parser';
import { renderStatusPage, formatDuration } from './status-page';
import { buildHaDevices, loadAllDoors, parseConfiguredDoors, routeRequiresAuth } from './doors';

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
    if (!env.WEBHOOK_URL) {
      console.log('No WEBHOOK_URL configured, skipping scheduled alert check.');
      return;
    }

    const thresholdStr = env.ALERT_OPEN_THRESHOLD_MINUTES || '60';
    const thresholdMinutes = parseInt(thresholdStr, 10);

    if (isNaN(thresholdMinutes) || thresholdMinutes <= 0) {
      console.error('Invalid ALERT_OPEN_THRESHOLD_MINUTES value:', thresholdStr);
      return;
    }

    const thresholdMs = thresholdMinutes * 60 * 1000;
    const nowMs = Date.now();

    try {
      const configuredDoors = parseConfiguredDoors(env);

      for (const [doorName, doorKey] of Object.entries(configuredDoors)) {
        const state = await getDoorState(env, doorKey);

        if (state.value === 'OPEN' && state.createdAt) {
          const createdAtMs = new Date(state.createdAt).getTime();

          if (!isNaN(createdAtMs)) {
            const durationMs = nowMs - createdAtMs;

            if (durationMs > thresholdMs) {
              const durationText = formatDuration(durationMs);
              console.log(`Alert! ${doorName} has been open for ${durationText}.`);

              const payload = {
                title: 'Garage Door Alert',
                message: `${doorName} has been open for ${durationText}.`,
                door: doorName,
                state: state.value,
                durationMs: durationMs,
                durationText: durationText,
              };

              try {
                const response = await fetch(env.WEBHOOK_URL, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload),
                });

                if (!response.ok) {
                  console.error(
                    `Failed to send webhook for ${doorName}. Status: ${response.status}`,
                  );
                } else {
                  console.log(`Successfully sent webhook for ${doorName}.`);
                }
              } catch (webhookErr) {
                console.error(`Error sending webhook for ${doorName}:`, webhookErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in scheduled handler:', err);
    }
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (routeRequiresAuth(request, env) && !isAuthorized(request, env)) {
      return new Response('Unauthorized', { status: 401 });
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

      const html = renderStatusPage(doors, combinedHistory);

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
