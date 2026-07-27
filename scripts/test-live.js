#! /usr/bin/env node
/* global process */

const url = process.argv[2];
const doorName = process.argv[3];
const action = process.argv[4];

if (!url || !doorName || !action) {
  console.log(`
Usage: node scripts/test-live.js <URL> <DOOR_NAME> <ACTION>

Arguments:
  URL         Your worker URL (e.g. https://myq-worker.your-subdomain.workers.dev)
  DOOR_NAME   The exact configured door name (e.g. "Garage Door Left")
  ACTION      The simulated action: "opened", "closed", or "stopped"

Note: POST /api/simulate is not API-key protected in the worker. Protect the dashboard
with Cloudflare Access; this script must be able to reach /api/simulate (e.g. local
dev, or an Access-authenticated session / bypass for testing).

Example:
  node scripts/test-live.js http://localhost:8787 "Garage Door Left" opened
  node scripts/test-live.js https://my-worker.workers.dev "Main Garage" closed
  `);
  process.exit(1);
}

async function simulate() {
  let targetUrl = url;
  if (!targetUrl.endsWith('/api/simulate') && !targetUrl.endsWith('/simulate')) {
    targetUrl = targetUrl.replace(/\/$/, '') + '/api/simulate';
  }

  const payload = {
    deviceName: doorName,
    action: action,
  };

  console.log(`Sending POST ${targetUrl}`);
  console.log(`Payload: ${JSON.stringify(payload)}`);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log(`\\nResponse Status: ${res.status}`);

    try {
      const parsed = JSON.parse(text);
      console.log('Response Body:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Response Body:', text);
    }

    if (res.ok) {
      console.log('\\n✅ Simulation request successful!');
    } else {
      console.log('\\n❌ Simulation request failed.');
    }
  } catch (err) {
    console.error('\\n❌ Network error:', err.message);
  }
}

simulate();
