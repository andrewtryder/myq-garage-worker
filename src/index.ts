import { Env } from './types';
import { getDoorState, saveDoorState, getDoorHistory } from './storage';
import { mapActionToStatus, parseMyQSubject, resolveFeedKey } from './email-parser';
import { renderStatusPage, HistoryEntry } from './status-page';

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
      const feedKey = resolveFeedKey(deviceName, env);
      if (!feedKey) {
        console.log('Unknown device name:', deviceName);
        return;
      }

      const value = mapActionToStatus(action);
      await saveDoorState(env, feedKey, value);
    } catch (err) {
      console.error('Error handling MyQ email:', err);
    }
  },

  // HTTP handler – serves a status page or raw JSON at your workers.dev URL
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const [right, left, rightHistory, leftHistory] = await Promise.all([
        getDoorState(env, env.GARAGE_RIGHT_FEED),
        getDoorState(env, env.GARAGE_LEFT_FEED),
        getDoorHistory(env, env.GARAGE_RIGHT_FEED),
        getDoorHistory(env, env.GARAGE_LEFT_FEED),
      ]);

      // Merge and sort histories descending by timestamp
      const history: HistoryEntry[] = [
        ...rightHistory.map((item) => ({ ...item, door: 'right' as const })),
        ...leftHistory.map((item) => ({ ...item, door: 'left' as const })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const url = new URL(request.url);
      const isJson = url.searchParams.get('json') === 'true';

      if (isJson) {
        return new Response(JSON.stringify({ right, left, history }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      const html = renderStatusPage(right, left, history);

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
