import { Env } from './types';
import { getDoorState, saveDoorState, getDoorHistory } from './storage';
import { mapActionToStatus, parseMyQSubject, resolveDoorKey } from './email-parser';
import { renderStatusPage, HistoryEntry, DoorData, formatDuration } from './status-page';

export type { Env };

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.API_KEY) {
    return true; // No API key configured, leave unprotected
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
  // Handles incoming emails from Cloudflare Email Routing
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

  // HTTP handler – serves a status page or raw JSON at your workers.dev URL

  // Scheduled handler - triggered by Cloudflare Cron Triggers to alert on stale states
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
      let configuredDoors: Record<string, string> = {};

      if (typeof env.GARAGE_DOORS === 'string') {
        try {
          configuredDoors = JSON.parse(env.GARAGE_DOORS);
        } catch {
          console.error('Failed to parse GARAGE_DOORS JSON string');
          return;
        }
      } else if (
        typeof env.GARAGE_DOORS === 'object' &&
        env.GARAGE_DOORS !== null &&
        !Array.isArray(env.GARAGE_DOORS)
      ) {
        configuredDoors = env.GARAGE_DOORS;
      }

      for (const [doorName, doorKey] of Object.entries(configuredDoors)) {
        const state = await getDoorState(env, doorKey);

        if (state.value === 'OPEN' && state.createdAt) {
          const createdAtMs = new Date(state.createdAt).getTime();

          if (!isNaN(createdAtMs)) {
            const durationMs = nowMs - createdAtMs;

            if (durationMs > thresholdMs) {
              const durationText = formatDuration(durationMs);
              console.log(`Alert! ${doorName} has been open for ${durationText}.`);

              // Post to Webhook (Apprise/ntfy.sh/HomeAssistant friendly)
              const payload = {
                title: 'Garage Door Alert',
                message: `${doorName} has been open for ${durationText}.`,
                door: doorName,
                state: state.value,
                durationMs: durationMs,
                durationText: durationText,
              };

              try {
                // We send it as JSON so systems like Apprise and n8n can easily parse it
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
    if (!isAuthorized(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      let configuredDoors: Record<string, string> = {};

      if (typeof env.GARAGE_DOORS === 'string') {
        try {
          configuredDoors = JSON.parse(env.GARAGE_DOORS);
        } catch {
          console.error('Failed to parse GARAGE_DOORS JSON string');
        }
      } else if (
        typeof env.GARAGE_DOORS === 'object' &&
        env.GARAGE_DOORS !== null &&
        !Array.isArray(env.GARAGE_DOORS)
      ) {
        configuredDoors = env.GARAGE_DOORS;
      }

      // Fetch state and history for all configured doors
      const doorDataPromises = Object.entries(configuredDoors).map(async ([doorName, doorKey]) => {
        const [state, history] = await Promise.all([
          getDoorState(env, doorKey),
          getDoorHistory(env, doorKey),
        ]);
        return {
          name: doorName,
          key: doorKey,
          state,
          history,
        };
      });

      const allDoorData = await Promise.all(doorDataPromises);

      // Map to Data structure for UI
      const nowMs = Date.now();
      const doors: DoorData[] = allDoorData.map((d) => {
        let durationMs: number | undefined;
        let durationText: string | undefined;

        if (d.state.createdAt) {
          const createdAtMs = new Date(d.state.createdAt).getTime();
          if (!isNaN(createdAtMs)) {
            durationMs = nowMs - createdAtMs;
            durationText = formatDuration(durationMs);
          }
        }

        return {
          name: d.name,
          state: d.state,
          durationMs,
          durationText,
        };
      });

      // Merge and sort histories descending by timestamp
      let combinedHistory: HistoryEntry[] = [];
      allDoorData.forEach((d) => {
        const doorHistory: HistoryEntry[] = d.history.map((item) => ({
          ...item,
          doorName: d.name,
        }));
        combinedHistory = combinedHistory.concat(doorHistory);
      });

      combinedHistory.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Cap combined history for UI at 10
      combinedHistory = combinedHistory.slice(0, 10);

      const url = new URL(request.url);

      // Simulate endpoint
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
