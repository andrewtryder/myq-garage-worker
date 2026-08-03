import { apiFetch, escapeHtml, formatRelativeTime, statusClass } from './api';
import { icons } from './icons';

interface DashboardDoor {
  id: string;
  name: string;
  status: string;
  stateSince: string;
  durationSeconds: number | null;
  durationText: string | null;
  lastEmailAt: string | null;
  lastEventAt: string | null;
  stale: boolean;
  alertsEnabled: boolean;
  notifyAfterMinutes: number;
  reminderIntervalMinutes: number | null;
}

interface DashboardEvent {
  doorId: string;
  doorName: string;
  status: string;
  createdAt: string;
}

interface DashboardResponse {
  generatedAt: string;
  doors: DashboardDoor[];
  recentEvents: DashboardEvent[];
  lastEventAt: string | null;
  lastEmailReceivedAt: string | null;
  lastStateChangeAt: string | null;
  staleAfterHours: number;
  stale: boolean;
  emailPipelineStale: boolean;
  openCount: number;
  healthy: boolean;
}

const REFRESH_MS = 45_000;

function durationLabel(door: DashboardDoor): string {
  const status = door.status.toUpperCase();
  if (!door.durationText) return 'No timestamp recorded';
  if (status === 'OPEN') return `Open ${door.durationText}`;
  if (status === 'CLOSED') return `Closed ${door.durationText} ago`;
  return `${status} ${door.durationText}`;
}

function alertSummary(door: DashboardDoor): string {
  if (!door.alertsEnabled) return 'Alerts off';
  const notify = `notifies after ${door.notifyAfterMinutes}m`;
  if (!door.reminderIntervalMinutes) return `${notify}, once`;
  return `${notify}, reminds every ${door.reminderIntervalMinutes}m`;
}

function emailAgeLabel(iso: string | null | undefined): string {
  if (!iso) return 'no email yet';
  const relative = formatRelativeTime(iso).replace(/^\(|\)$/g, '');
  return relative ? `Last garage email ${relative}` : `Last garage email ${iso}`;
}

function healthLine(data: DashboardResponse): { text: string; className: string } {
  const emailAge = emailAgeLabel(data.lastEmailReceivedAt ?? data.lastEventAt);
  const checked = formatRelativeTime(data.generatedAt).replace(/^\(|\)$/g, '') || 'just now';
  const staleDoors = data.doors.filter((door) => door.stale);
  if (staleDoors.length > 0 || data.stale || data.emailPipelineStale) {
    const n = staleDoors.length || 1;
    return {
      text: `${n} door status may be stale · ${emailAge}`,
      className: 'health-line health-stale',
    };
  }
  if (data.openCount > 0) {
    const label =
      data.openCount === 1
        ? `${data.doors.find((door) => door.status.toUpperCase() === 'OPEN')?.name ?? 'A door'} is open`
        : `${data.openCount} doors are open`;
    return {
      text: `${label} · ${emailAge} · Checked ${checked}`,
      className: 'health-line health-open',
    };
  }
  return {
    text: `All systems healthy · ${emailAge} · Checked ${checked}`,
    className: 'health-line health-ok',
  };
}

function doorEmailAgeLabel(iso: string | null | undefined): string {
  if (!iso) return 'no email yet';
  const relative = formatRelativeTime(iso).replace(/^\(|\)$/g, '');
  return relative || iso;
}

function renderStaleBanner(data: DashboardResponse): string {
  const staleDoors = data.doors.filter((door) => door.stale);
  if (staleDoors.length === 0) return '';

  const names = staleDoors.map((door) => door.name);
  const nameList =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;

  const perDoor = staleDoors
    .map((door) => `Last email for ${door.name}: ${doorEmailAgeLabel(door.lastEmailAt)}.`)
    .join(' ');

  return `Status confidence is stale for ${nameList}. ${perDoor}`;
}

function pillIcon(status: string, stale: boolean): string {
  if (stale) return icons.warning();
  if (status === 'CLOSED') return icons.check();
  if (status === 'OPEN') return icons.arrowUp();
  return icons.door();
}

function renderDoors(doors: DashboardDoor[]): string {
  if (doors.length === 0) {
    return '<p class="empty">No doors configured.</p>';
  }

  const sorted = [...doors].sort((a, b) => {
    const aOpen = a.status.toUpperCase() === 'OPEN' ? 0 : 1;
    const bOpen = b.status.toUpperCase() === 'OPEN' ? 0 : 1;
    return aOpen - bOpen;
  });

  return sorted
    .map((door) => {
      const status = door.status.toUpperCase() || 'UNKNOWN';
      const open = status === 'OPEN';
      const pillClass = door.stale ? 'status-stale' : statusClass(status);
      const alertClass = door.alertsEnabled ? 'door-alert-on' : 'door-alert-off';
      return `
        <article class="door ${open ? 'door-open' : ''} ${door.stale ? 'door-stale' : ''}">
          <div class="door-header">
            <div class="door-title">
              ${icons.door()}
              <h3 class="door-name">${escapeHtml(door.name)}</h3>
            </div>
            <span class="status-pill ${pillClass}" aria-label="Status ${escapeHtml(status)}">
              ${pillIcon(status, door.stale)}
              <span>${escapeHtml(status)}</span>
            </span>
          </div>
          <p class="door-duration">${escapeHtml(durationLabel(door))}</p>
          <p class="door-alert-line ${alertClass}">
            ${door.alertsEnabled ? icons.bell() : icons.bellOff()}
            <span>${escapeHtml(alertSummary(door))}</span>
          </p>
          ${
            door.stale
              ? `<p class="door-stale-note">${icons.warning()}<span>No recent notification for this door</span></p>`
              : ''
          }
        </article>`;
    })
    .join('');
}

function renderTimeline(events: DashboardEvent[]): string {
  if (events.length === 0) {
    return '<p class="empty">No recent activity recorded.</p>';
  }

  return events
    .map((event) => {
      const status = (event.status || '').toUpperCase();
      const relative = formatRelativeTime(event.createdAt).replace(/^\(|\)$/g, '');
      const iconClass = status === 'OPEN' ? 'open' : status === 'CLOSED' ? 'closed' : 'other';
      const icon =
        status === 'OPEN'
          ? icons.arrowUp()
          : status === 'CLOSED'
            ? icons.arrowDown()
            : icons.door();
      return `
        <div class="timeline-item">
          <div class="timeline-main">
            <span class="timeline-icon ${iconClass}">${icon}</span>
            <span class="timeline-door">${escapeHtml(event.doorName)}</span>
          </div>
          <div class="timeline-time">${escapeHtml(relative || event.createdAt)}</div>
        </div>`;
    })
    .join('');
}

function setHidden(el: HTMLElement | null, hidden: boolean): void {
  if (!el) return;
  el.hidden = hidden;
}

async function loadDashboard(): Promise<void> {
  const healthEl = document.getElementById('health-line');
  const grid = document.getElementById('door-grid');
  const timeline = document.getElementById('timeline');
  const staleBanner = document.getElementById('stale-banner');
  const errorBanner = document.getElementById('error-banner');
  if (!healthEl || !grid || !timeline) return;

  grid.setAttribute('aria-busy', 'true');

  try {
    const data = await apiFetch<DashboardResponse>('/api/dashboard');
    const health = healthLine(data);
    healthEl.textContent = health.text;
    healthEl.className = health.className;

    const staleText = renderStaleBanner(data);
    if (staleBanner) {
      staleBanner.textContent = staleText;
      setHidden(staleBanner, !staleText);
    }
    setHidden(errorBanner, true);

    grid.innerHTML = renderDoors(data.doors);
    timeline.innerHTML = renderTimeline(data.recentEvents);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    healthEl.textContent = 'Unable to load status';
    healthEl.className = 'health-line health-error';
    if (errorBanner) {
      errorBanner.textContent = message;
      setHidden(errorBanner, false);
    }
    setHidden(staleBanner, true);
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

function startRefresh(): void {
  void loadDashboard();

  window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void loadDashboard();
    }
  }, REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void loadDashboard();
    }
  });
}

startRefresh();
