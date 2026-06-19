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

export interface StatusPageOptions {
  doorNames?: string[];
  openDoorNames?: string[];
  webhookConfigured?: boolean;
  alertThresholdMinutes?: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDoorSelectOptions(
  doorNames: string[],
  openDoorNames: string[] = [],
  forForce = false,
): string {
  if (doorNames.length === 0) {
    return '<option value="" disabled selected>No doors configured</option>';
  }

  return doorNames
    .map((name, index) => {
      const isOpen = openDoorNames.includes(name);
      const disabled = forForce && !isOpen ? ' disabled' : '';
      const suffix = forForce && !isOpen ? ' (not open)' : '';
      const selected = index === 0 && (!forForce || isOpen) ? ' selected' : '';
      return `<option value="${escapeHtml(name)}"${disabled}${selected}>${escapeHtml(name)}${suffix}</option>`;
    })
    .join('\n');
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

export function formatRelativeTime(isoDate: string, nowMs = Date.now()): string {
  const thenMs = new Date(isoDate).getTime();
  if (isNaN(thenMs)) return '';

  const diffMs = Math.max(0, nowMs - thenMs);
  const minutes = Math.floor(diffMs / (1000 * 60));

  if (minutes < 1) return '(just now)';
  if (minutes < 60) return `(${minutes}m ago)`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) {
    if (remMinutes === 0) return `(${hours}h ago)`;
    return `(${hours}h ${remMinutes}m ago)`;
  }

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `(${days}d ago)`;
  return `(${days}d ${remHours}h ago)`;
}

export function statusColor(value: string): string {
  const upperVal = value.toUpperCase();
  switch (upperVal) {
    case 'OPEN':
      return '#ff4d4f';
    case 'CLOSED':
      return '#52c41a';
    case 'STOPPED':
      return '#faad14';
    default:
      return '#8c8c8c';
  }
}

export function statusLabel(value: string | undefined): string {
  if (!value) return 'UNKNOWN';
  return value.toUpperCase();
}

export function renderStatusPage(
  doors: DoorData[] = [],
  history: HistoryEntry[] = [],
  options: StatusPageOptions = {},
): string {
  const doorNames = options.doorNames ?? doors.map((door) => door.name);
  const openDoorNames =
    options.openDoorNames ??
    doors.filter((door) => door.state.value === 'OPEN').map((door) => door.name);
  const webhookConfigured = options.webhookConfigured ?? false;
  const alertThresholdMinutes = options.alertThresholdMinutes ?? 60;
  const nowMs = Date.now();

  const doorsHtml = doors
    .map((door) => {
      const val = door.state.value || '';
      const time = door.state.createdAt || 'N/A';

      return `
      <div class="card">
        <div class="card-header">
          <div class="door-name">${escapeHtml(door.name)}</div>
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

            const absoluteTime = entry.createdAt || 'N/A';
            const relativeTime = entry.createdAt ? formatRelativeTime(entry.createdAt, nowMs) : '';

            return `
        <div class="timeline-item">
          <div class="timeline-marker ${doorClass}"></div>
          <div class="timeline-content">
            <span class="timeline-door">${escapeHtml(entry.doorName)}</span>
            <span class="timeline-action ${actionClass}">${statusLabel(entry.value)}</span>
            <span class="timeline-time">${absoluteTime}${relativeTime ? ` <span class="timeline-relative">${relativeTime}</span>` : ''}</span>
          </div>
        </div>
      `;
          })
          .join('\n');

  const simDoorOptions = buildDoorSelectOptions(doorNames);
  const alertDoorOptions = buildDoorSelectOptions(doorNames, openDoorNames, true);
  const webhookStatusText = webhookConfigured
    ? 'WEBHOOK_URL is configured'
    : 'WEBHOOK_URL is not configured';

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
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 12px;
      align-items: center;
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
      justify-self: start;
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
      justify-self: end;
      text-align: right;
      white-space: nowrap;
    }
    .timeline-relative {
      color: #6b7280;
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
    .sim-btn-secondary {
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.35);
      margin-top: 8px;
    }
    .sim-btn-secondary:hover {
      background: rgba(59, 130, 246, 0.25);
    }
    .alert-meta {
      font-size: 13px;
      color: #9ca3af;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .alert-result-item {
      font-size: 13px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(148,163,184,0.15);
    }
    .alert-result-item:last-child {
      border-bottom: none;
    }
    .alert-success { color: #52c41a; }
    .alert-skipped { color: #9ca3af; }
    .alert-error { color: #ff4d4f; }

  </style>
</head>
<body>
  <div class="wrapper">

    <div class="tabs">
      <div class="tab active" data-tab="dashboard" onclick="switchTab('dashboard')">Dashboard</div>
      <div class="tab" data-tab="simulator" onclick="switchTab('simulator')">Simulator</div>
      <div class="tab" data-tab="alerts" onclick="switchTab('alerts')">Alert Test</div>
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
              <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">Door</label>
              <select id="simDoor" required class="sim-input">
                ${simDoorOptions}
              </select>
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

            <button type="submit" id="simBtn" class="sim-btn">Simulate Event</button>
          </form>

          <div id="simResult" style="margin-top:16px;font-size:14px;display:none;padding:12px;border-radius:8px;"></div>
        </div>
      </div>
    </div>

    <div id="alerts-view" style="display: none;">
      <h1>Alert Test</h1>
      <div class="subtitle">
        Test the left-open webhook alert (same HTTP POST as the cron job every 15 minutes).
      </div>
      <div class="card history-card">
        <div class="alert-meta">
          ${webhookStatusText}<br/>
          Alert threshold: ${alertThresholdMinutes} minutes
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">API Key (If configured)</label>
          <input type="password" id="alertKey" placeholder="Your API_KEY" class="sim-input" />
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;font-size:12px;color:#9ca3af;">Door (for force test)</label>
          <select id="alertDoor" class="sim-input">
            ${alertDoorOptions}
          </select>
        </div>

        <button type="button" id="alertCheckBtn" class="sim-btn" onclick="submitAlertCheck(false)">Run alert check</button>
        <button type="button" id="alertForceBtn" class="sim-btn sim-btn-secondary" onclick="submitAlertCheck(true)">Force test alert</button>

        <div id="alertResult" style="margin-top:16px;font-size:14px;display:none;padding:12px;border-radius:8px;"></div>
      </div>
    </div>

  </div>

  <script>
    function switchTab(tabId) {
      const views = ['dashboard', 'simulator', 'alerts'];
      views.forEach(function(viewId) {
        document.getElementById(viewId + '-view').style.display = viewId === tabId ? 'block' : 'none';
      });

      document.querySelectorAll('.tab').forEach(function(tab) {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
      });
    }

    function buildAuthUrl(path) {
      const keyInput = document.getElementById(path === '/simulate-alert' ? 'alertKey' : 'simKey');
      const key = keyInput ? keyInput.value : '';
      if (!key) return path;
      return path + '?key=' + encodeURIComponent(key);
    }

    async function submitSimulation(e) {
      e.preventDefault();
      const btn = document.getElementById('simBtn');
      const resDiv = document.getElementById('simResult');

      btn.disabled = true;
      btn.textContent = 'Simulating...';
      resDiv.style.display = 'none';

      const payload = {
        deviceName: document.getElementById('simDoor').value,
        action: document.getElementById('simAction').value,
      };

      try {
        const response = await fetch(buildAuthUrl('/simulate'), {
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
          setTimeout(function() { window.location.reload(); }, 1500);
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

    function formatAlertResults(results) {
      if (!Array.isArray(results) || results.length === 0) {
        return '<div class="alert-skipped">No results returned.</div>';
      }

      return results.map(function(result) {
        const doorLabel = result.door ? result.door + ': ' : '';
        if (result.sent) {
          return '<div class="alert-result-item alert-success">' + doorLabel + 'Webhook sent (HTTP ' + result.webhookStatus + ')</div>';
        }
        if (result.error) {
          return '<div class="alert-result-item alert-error">' + doorLabel + result.error + '</div>';
        }
        return '<div class="alert-result-item alert-skipped">' + doorLabel + (result.skippedReason || 'Skipped') + '</div>';
      }).join('');
    }

    async function submitAlertCheck(force) {
      const checkBtn = document.getElementById('alertCheckBtn');
      const forceBtn = document.getElementById('alertForceBtn');
      const resDiv = document.getElementById('alertResult');

      checkBtn.disabled = true;
      forceBtn.disabled = true;
      resDiv.style.display = 'none';

      const payload = {};
      if (force) {
        const doorName = document.getElementById('alertDoor').value;
        if (!doorName) {
          resDiv.style.display = 'block';
          resDiv.style.background = 'rgba(255, 77, 79, 0.15)';
          resDiv.style.color = '#ff4d4f';
          resDiv.style.border = '1px solid rgba(255, 77, 79, 0.3)';
          resDiv.innerHTML = 'Select an open door for force test.';
          checkBtn.disabled = false;
          forceBtn.disabled = false;
          return;
        }
        payload.forceDoorName = doorName;
      }

      try {
        const response = await fetch(buildAuthUrl('/simulate-alert'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        resDiv.style.display = 'block';
        resDiv.style.background = 'rgba(15,23,42,0.5)';
        resDiv.style.color = '#e5e7eb';
        resDiv.style.border = '1px solid rgba(148,163,184,0.3)';

        if (response.ok) {
          resDiv.innerHTML = formatAlertResults(data.results);
        } else {
          resDiv.innerHTML = '<div class="alert-error">' + (data.error || 'Unknown error') + '</div>';
        }
      } catch (err) {
        resDiv.style.display = 'block';
        resDiv.style.background = 'rgba(255, 77, 79, 0.15)';
        resDiv.style.color = '#ff4d4f';
        resDiv.style.border = '1px solid rgba(255, 77, 79, 0.3)';
        resDiv.textContent = 'Network error: ' + err.message;
      } finally {
        checkBtn.disabled = false;
        forceBtn.disabled = false;
      }
    }
  </script>

</body>
</html>`;
}
