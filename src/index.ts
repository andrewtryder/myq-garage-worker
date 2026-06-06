export interface Env {
  ADAFRUIT_USERNAME: string;
  ADAFRUIT_IO_KEY: string;
  GARAGE_LEFT_FEED: string;
  GARAGE_RIGHT_FEED: string;
}

async function postToAdafruit(env: Env, feedKey: string, value: string): Promise<void> {
  const url = `https://io.adafruit.com/api/v2/${env.ADAFRUIT_USERNAME}/feeds/${feedKey}/data`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AIO-Key': env.ADAFRUIT_IO_KEY,
    },
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to post to Adafruit IO', res.status, text);
    throw new Error(`Adafruit IO error ${res.status}`);
  }

  console.log(`Updated feed ${feedKey} to ${value}`);
}

async function getLastFromAdafruit(
  env: Env,
  feedKey: string,
): Promise<{ value: string; createdAt: string } | null> {
  // Include only what we care about: value + created_at
  const url =
    `https://io.adafruit.com/api/v2/${env.ADAFRUIT_USERNAME}` +
    `/feeds/${feedKey}/data/last?include=value,created_at`;

  const res = await fetch(url, {
    headers: {
      'X-AIO-Key': env.ADAFRUIT_IO_KEY,
    },
  });

  if (!res.ok) {
    console.error('Failed to read from Adafruit IO', feedKey, res.status);
    return null;
  }

  const data = (await res.json()) as { value?: string; created_at?: string };
  return {
    value: String(data.value || '').toUpperCase(),
    createdAt: data.created_at || '',
  };
}

function statusColor(value: string): string {
  switch (value) {
    case 'OPEN':
      return '#ff4d4f'; // red
    case 'CLOSED':
      return '#52c41a'; // green
    case 'STOPPED':
      return '#faad14'; // amber
    default:
      return '#8c8c8c'; // grey / unknown
  }
}

function statusLabel(value: string | undefined): string {
  if (!value) return 'UNKNOWN';
  return value;
}

export default {
  // Handles incoming emails from Cloudflare Email Routing
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const fromHeader = message.headers.get('from') || '';
      if (!fromHeader.toLowerCase().includes('notification@myq.com')) {
        console.log('Not a MyQ email, ignoring');
        // If you prefer to hard-reject non-MyQ senders:
        // message.setReject("Sender not allowed");
        return;
      }

      const subject = message.headers.get('subject') || '';
      console.log('Subject:', subject);

      // Example:
      // "myQ Notification: Garage Door Right just opened"
      // "myQ Notification: Garage Door Right just stopped"
      const pattern = /myq notification:\s*(.+?)\s+(?:just\s+)?(opened|closed|stopped)/i;
      const match = subject.match(pattern);

      if (!match) {
        console.log('Subject did not match MyQ pattern');
        return;
      }

      const deviceName = match[1]; // e.g. "Garage Door Right"
      const actionWord = match[2]; // "opened" | "closed" | "stopped"
      const action = actionWord.toLowerCase();

      // Decide which feed to hit
      let feedKey: string;
      if (/garage door right/i.test(deviceName)) {
        feedKey = env.GARAGE_RIGHT_FEED;
      } else if (/garage door left/i.test(deviceName)) {
        feedKey = env.GARAGE_LEFT_FEED;
      } else {
        console.log('Unknown device name:', deviceName);
        return;
      }

      // Map to feed value
      let value: string;
      if (action === 'opened') {
        value = 'OPEN';
      } else if (action === 'closed') {
        value = 'CLOSED';
      } else {
        // stopped (door stopped mid-travel)
        value = 'STOPPED'; // change to "OPEN" if you prefer binary logic
      }

      await postToAdafruit(env, feedKey, value);

      // Optional: forward the original email somewhere after processing:
      // await message.forward("your-normal-inbox@gmail.com");
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

      const rightValue = right?.value || '';
      const rightTime = right?.createdAt || 'N/A';
      const leftValue = left?.value || '';
      const leftTime = left?.createdAt || 'N/A';

      const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Garage Status – MyQ / Adafruit IO</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
                   sans-serif;
      background: radial-gradient(circle at top, #1f2933, #050816);
      color: #f9fafb;
      display: flex;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
    }
    .wrapper {
      max-width: 900px;
      width: 100%;
      padding: 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: 0.03em;
    }
    .subtitle {
      margin-bottom: 24px;
      color: #9ca3af;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .card {
      background: rgba(15,23,42,0.9);
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 14px 45px rgba(0,0,0,0.35);
      border: 1px solid rgba(148,163,184,0.2);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .door-name {
      font-weight: 600;
      font-size: 16px;
    }
    .status-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0b1120;
    }
    .meta {
      font-size: 12px;
      color: #9ca3af;
    }
    .status-open   { background-color: ${statusColor('OPEN')}; }
    .status-closed { background-color: ${statusColor('CLOSED')}; }
    .status-stopped{ background-color: ${statusColor('STOPPED')}; }
    .status-unknown{ background-color: ${statusColor('UNKNOWN')}; }
  </style>
</head>
<body>
  <div class="wrapper">
    <h1>Garage Door Status</h1>
    <div class="subtitle">
      Source: MyQ email notifications → Cloudflare Email Worker → Adafruit IO feeds.
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-header">
          <div class="door-name">Garage Door Right</div>
          <span class="status-pill ${
            rightValue === 'OPEN'
              ? 'status-open'
              : rightValue === 'CLOSED'
                ? 'status-closed'
                : rightValue === 'STOPPED'
                  ? 'status-stopped'
                  : 'status-unknown'
          }">
            ${statusLabel(rightValue)}
          </span>
        </div>
        <div class="meta">
          Last update: ${rightTime}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="door-name">Garage Door Left</div>
          <span class="status-pill ${
            leftValue === 'OPEN'
              ? 'status-open'
              : leftValue === 'CLOSED'
                ? 'status-closed'
                : leftValue === 'STOPPED'
                  ? 'status-stopped'
                  : 'status-unknown'
          }">
            ${statusLabel(leftValue)}
          </span>
        </div>
        <div class="meta">
          Last update: ${leftTime}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

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
