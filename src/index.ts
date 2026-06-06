import { Env } from './types';
import { getLastFromAdafruit, postToAdafruit } from './adafruit';
import { mapActionToStatus, parseMyQSubject, resolveFeedKey } from './email-parser';
import { renderStatusPage } from './status-page';

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
      await postToAdafruit(env, feedKey, value);
    } catch (err) {
      console.error('Error handling MyQ email:', err);
    }
  },

  // HTTP handler – serves a simple status page at your workers.dev URL
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const [right, left] = await Promise.all([
        getLastFromAdafruit(env, env.GARAGE_RIGHT_FEED),
        getLastFromAdafruit(env, env.GARAGE_LEFT_FEED),
      ]);

      const html = renderStatusPage(right, left);

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (err) {
      console.error('Error rendering status page:', err);
      return new Response('Error rendering status page', { status: 500 });
    }
  },
};
