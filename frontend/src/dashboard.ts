import { apiFetch, escapeHtml, formatRelativeTime, statusClass } from './api';

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

function statusIcon(status: string): string {
  switch (status) {
    case 'OPEN':
      return '!';
    case 'CLOSED':
      return '✓';
    case 'STOPPED':
      return '◼';
    default:
      return '?';
  }
}

function durationLabel(door: DashboardDoor): string {
  const status = door.status.toUpperCase();
  if (!door.durationText) return 'No timestamp recorded';
  if (status === 'OPEN') return `Open for ${door.durationText}`;
  if (status === 'CLOSED') return `Closed ${door.durationText} ago`;
  return `${status} for ${door.durationText}`;
}

function emailAgeLabel(iso: string | null | undefined): string {
  if (!iso) return 'no email yet';
  const relative = formatRelativeTime(iso).replace(/^\(|\)$/g, '');
  return relative ? `Last garage email ${relative}` : `Last garage email ${iso}`;
}

function healthLine(data: DashboardResponse): { text: string; className: string } {
  const emailAge = emailAgeLabel(data.lastEmailReceivedAt ?? data.lastEventAt);
  const checked = formatRelativeTime(data.generatedAt).replace(/^\(|\)$/g, '') || 'just now';
  if (data.stale || data.emailPipelineStale) {
    return {
      text: `Status may be stale · ${emailAge}`,
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

function renderStaleBanner(data: DashboardResponse): string {
  if (!data.stale && !data.emailPipelineStale) return '';
  const hours = data.staleAfterHours;
  const days = hours >= 24 ? `${Math.round((hours / 24) * 10) / 10} days` : `${hours} hours`;
  const last = data.lastEmailReceivedAt ?? data.lastEventAt;
  const lastText = last
    ? `Last garage email ${formatRelativeTime(last)}.`
    : 'No garage email has been recorded yet.';
  return `Status may be stale. No garage email within ${days}. ${lastText}`;
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
      return `
        <article class="door ${open ? 'door-open' : ''} ${door.stale ? 'door-stale' : ''}">
          <div class="door-header">
            <h3 class="door-name">${escapeHtml(door.name)}</h3>
            <p class="door-status ${statusClass(status)}" aria-label="Status ${escapeHtml(status)}">
              <span class="door-icon" aria-hidden="true">${statusIcon(status)}</span>
              <span>${escapeHtml(status)}</span>
            </p>
          </div>
          <p class="door-duration">${escapeHtml(durationLabel(door))}</p>
          ${door.stale ? '<p class="door-stale-note">No recent notification for this door</p>' : ''}
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
      const action =
        status === 'OPEN' ? 'opened' : status === 'CLOSED' ? 'closed' : status.toLowerCase();
      return `
        <div class="timeline-item">
          <div class="timeline-main">
            <span class="timeline-door">${escapeHtml(event.doorName)}</span>
            <span class="timeline-action action-${statusClass(status).replace('status-', '')}">${escapeHtml(action)}</span>
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
