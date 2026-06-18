import { DoorState } from './types';

export interface HistoryEntry extends DoorState {
  doorName: string;
}

export interface DoorData {
  name: string;
  state: DoorState;
  durationMs?: number;
  durationText?: string;
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes === 1 ? '' : 's'}`);

  if (parts.length === 0) return 'Just now';
  return parts.join(' ');
}

export function statusColor(value: string): string {
  const upperVal = value.toUpperCase();
  switch (upperVal) {
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

export function statusLabel(value: string | undefined): string {
  if (!value) return 'UNKNOWN';
  return value.toUpperCase();
}

export function renderStatusPage(doors: DoorData[] = [], history: HistoryEntry[] = []): string {
  const doorsHtml = doors
    .map((door) => {
      const val = door.state.value || '';
      const time = door.state.createdAt || 'N/A';

      return `
      <div class="card">
        <div class="card-header">
          <div class="door-name">${door.name}</div>
          <span class="status-pill ${
            val === 'OPEN'
              ? 'status-open'
              : val === 'CLOSED'
                ? 'status-closed'
                : val === 'STOPPED'
                  ? 'status-stopped'
                  : 'status-unknown'
          }">
            ${statusLabel(val)}
          </span>
        </div>
        <div class="meta">
          Last update: ${time}
          ${door.durationText ? `<br/>Duration: ${door.durationText}` : ''}
        </div>
      </div>
    `;
    })
    .join('\n');

  const historyHtml =
    history.length === 0
      ? `<div class="empty-history">No recent activity recorded.</div>`
      : history
          .map((entry) => {
            const statusUpper = entry.value.toUpperCase();
            const doorClass =
              statusUpper === 'OPEN'
                ? 'status-open'
                : statusUpper === 'CLOSED'
                  ? 'status-closed'
                  : statusUpper === 'STOPPED'
                    ? 'status-stopped'
                    : 'status-unknown';

            const actionClass =
              statusUpper === 'OPEN'
                ? 'action-open'
                : statusUpper === 'CLOSED'
                  ? 'action-closed'
                  : statusUpper === 'STOPPED'
                    ? 'action-stopped'
                    : 'action-unknown';

            return `
        <div class="timeline-item">
          <div class="timeline-marker ${doorClass}"></div>
          <div class="timeline-content">
            <span class="timeline-door">${entry.doorName}</span>
            <span class="timeline-action ${actionClass}">${statusLabel(entry.value)}</span>
            <span class="timeline-time">${entry.createdAt || 'N/A'}</span>
          </div>
        </div>
      `;
          })
          .join('\n');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Garage Status – MyQ / Cloudflare KV</title>
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

    /* History Log Timeline CSS */
    .history-card {
      margin-top: 24px;
    }
    .timeline {
      margin-top: 16px;
      position: relative;
      padding-left: 20px;
      border-left: 2px solid rgba(148, 163, 184, 0.15);
    }
    .timeline-item {
      position: relative;
      margin-bottom: 16px;
    }
    .timeline-item:last-child {
      margin-bottom: 0;
    }
    .timeline-marker {
      position: absolute;
      left: -27px;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid #0b1120;
    }
    .timeline-marker.status-open { background-color: ${statusColor('OPEN')}; box-shadow: 0 0 8px rgba(255, 77, 79, 0.4); }
    .timeline-marker.status-closed { background-color: ${statusColor('CLOSED')}; box-shadow: 0 0 8px rgba(82, 196, 26, 0.4); }
    .timeline-marker.status-stopped { background-color: ${statusColor('STOPPED')}; box-shadow: 0 0 8px rgba(250, 173, 20, 0.4); }
    .timeline-marker.status-unknown { background-color: ${statusColor('UNKNOWN')}; }

    .timeline-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 14px;
    }
    .timeline-door {
      font-weight: 500;
      color: #e5e7eb;
    }
    .timeline-action {
      font-weight: 600;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .action-open {
      background: rgba(255, 77, 79, 0.15);
      color: #ff4d4f;
    }
    .action-closed {
      background: rgba(82, 196, 26, 0.15);
      color: #52c41a;
    }
    .action-stopped {
      background: rgba(250, 173, 20, 0.15);
      color: #faad14;
    }
    .action-unknown {
      background: rgba(140, 140, 140, 0.15);
      color: #8c8c8c;
    }
    .timeline-time {
      font-size: 12px;
      color: #9ca3af;
    }
    .empty-history {
      color: #9ca3af;
      font-size: 14px;
      padding: 16px 0;
    }

    .tabs {
      display: flex;
      margin-bottom: 24px;
      border-bottom: 1px solid rgba(148,163,184,0.2);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #9ca3af;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .tab:hover {
      color: #e5e7eb;
    }
    .tab.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
    }
    .sim-input {
      width: 100%;
      background: rgba(15,23,42,0.5);
      border: 1px solid rgba(148,163,184,0.3);
      border-radius: 6px;
      padding: 8px 12px;
      color: #f9fafb;
      font-size: 14px;
      box-sizing: border-box;
      outline: none;
    }
    .sim-input:focus {
      border-color: #3b82f6;
    }
    .sim-btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
    }
    .sim-btn:hover {
      background: #2563eb;
    }
    .sim-btn:disabled {
      background: #475569;
      cursor: not-allowed;
    }

  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Tabs Navigation -->
    <div class="tabs">
      <div class="tab active" onclick="switchTab('dashboard')">Dashboard</div>
      <div class="tab" onclick="switchTab('simulator')">Simulator</div>
    </div>

    <div id="dashboard-view">
      <h1>Garage Door Status</h1>
      <div class="subtitle">
        Source: MyQ email notifications → Cloudflare Email Worker → Cloudflare KV.
      </div>
      <div class="grid">
        ${doorsHtml}
      </div>

      <div class="card history-card">
        <div class="card-header">
          <div class="door-name">Recent Activity Log</div>
        </div>
        <div class="timeline">
          ${historyHtml}
        </div>
      </div>
    </div>

    <div id="simulator-view" style="display: none;">
      <h1>Test Simulator</h1>
      <div class="subtitle">
        Send a simulated test event to check your configuration without triggering a real garage door.
      </div>
      <div class="card history-card">
        <div class="simulator-body">
          <form id="simForm" onsubmit="submitSimulation(event)">
            <div style="margin-bottom:12px;">
              <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">Door Name (Exact Match)</label>
              <input type="text" id="simDoor" placeholder="e.g. Garage Door Left" required class="sim-input" />
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">Action</label>
              <select id="simAction" required class="sim-input">
                <option value="opened">Opened</option>
                <option value="closed">Closed</option>
                <option value="stopped">Stopped</option>
              </select>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">API Key (If configured)</label>
              <input type="password" id="simKey" placeholder="Your API_KEY" class="sim-input" />
            </div>

            <div style="margin-bottom: 16px; border-top: 1px solid rgba(148,163,184,0.2); margin-top: 16px; padding-top: 16px;">
              <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">Or paste raw MyQ Subject line</label>
              <input type="text" id="simSubject" placeholder="myQ Notification: Garage Door Right just opened" class="sim-input" />
            </div>

            <button type="submit" id="simBtn" class="sim-btn">Simulate Event</button>
          </form>

          <div id="simResult" style="margin-top:16px;font-size:14px;display:none;padding:12px;border-radius:8px;"></div>
        </div>
      </div>
    </div>

  </div>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.tab[onclick="switchTab(' + "'" + tabId + "'" + ')"]').classList.add('active');

      if (tabId === 'dashboard') {
        document.getElementById('dashboard-view').style.display = 'block';
        document.getElementById('simulator-view').style.display = 'none';
      } else {
        document.getElementById('dashboard-view').style.display = 'none';
        document.getElementById('simulator-view').style.display = 'block';
      }
    }

    async function submitSimulation(e) {
      e.preventDefault();
      const btn = document.getElementById('simBtn');
      const resDiv = document.getElementById('simResult');

      btn.disabled = true;
      btn.textContent = 'Simulating...';
      resDiv.style.display = 'none';

      const doorName = document.getElementById('simDoor').value;
      const action = document.getElementById('simAction').value;
      const key = document.getElementById('simKey').value;
      const subject = document.getElementById('simSubject').value;

      const payload = {};
      if (subject) {
        payload.subject = subject;
      } else {
        payload.deviceName = doorName;
        payload.action = action;
      }

      let url = '/simulate';
      if (key) {
        url += '?key=' + encodeURIComponent(key);
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        resDiv.style.display = 'block';

        if (response.ok) {
          resDiv.style.background = 'rgba(82, 196, 26, 0.15)';
          resDiv.style.color = '#52c41a';
          resDiv.style.border = '1px solid rgba(82, 196, 26, 0.3)';
          resDiv.textContent = 'Success! ' + data.door + ' state updated to ' + data.state;
          setTimeout(() => window.location.reload(), 1500);
        } else {
          resDiv.style.background = 'rgba(255, 77, 79, 0.15)';
          resDiv.style.color = '#ff4d4f';
          resDiv.style.border = '1px solid rgba(255, 77, 79, 0.3)';
          resDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
        }
      } catch (err) {
        resDiv.style.display = 'block';
        resDiv.style.background = 'rgba(255, 77, 79, 0.15)';
        resDiv.style.color = '#ff4d4f';
        resDiv.style.border = '1px solid rgba(255, 77, 79, 0.3)';
        resDiv.textContent = 'Network error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Simulate Event';
      }
    }
  </script>

</body>
</html>`;
}
