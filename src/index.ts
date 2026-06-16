import { Env } from './types';
import { getDoorState, saveDoorState, getDoorHistory } from './storage';
import { mapActionToStatus, parseMyQSubject, resolveDoorKey, slugify } from './email-parser';
import { renderStatusPage, HistoryEntry, DoorData } from './status-page';

export type { Env };

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
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      let configuredDoors: string[] = [];
      if (typeof env.GARAGE_DOORS === 'string') {
        try {
          configuredDoors = JSON.parse(env.GARAGE_DOORS);
        } catch {
          configuredDoors = [env.GARAGE_DOORS];
        }
      } else if (Array.isArray(env.GARAGE_DOORS)) {
        configuredDoors = env.GARAGE_DOORS;
      }

      // Fetch state and history for all configured doors
      const doorDataPromises = configuredDoors.map(async (doorName) => {
        const doorKey = slugify(doorName);
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
      const doors: DoorData[] = allDoorData.map((d) => ({
        name: d.name,
        state: d.state,
      }));

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

      // Cap combined history for UI at 50
      combinedHistory = combinedHistory.slice(0, 50);

      const url = new URL(request.url);
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
