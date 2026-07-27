import { apiFetch, escapeHtml, formatRelativeTime, statusClass } from './api';

interface DashboardDoor {
  id: string;
  name: string;
  status: string;
  stateSince: string;
  durationSeconds: number | null;
  durationText: string | null;
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
}

function renderSummary(doors: DashboardDoor[]): string {
  const open = doors.filter((door) => door.status.toUpperCase() === 'OPEN');
  if (doors.length === 0) return 'No doors configured.';
  if (open.length === 0) return 'All doors closed';
  if (open.length === 1) return `${open[0].name} is open`;
  return `${open.length} doors are open`;
}

function renderDoors(doors: DashboardDoor[]): string {
  if (doors.length === 0) {
    return '<div class="card"><p class="empty">No doors configured.</p></div>';
  }

  return doors
    .map((door) => {
      const status = door.status.toUpperCase() || 'UNKNOWN';
      const duration = door.durationText
        ? `<div class="duration">${escapeHtml(door.durationText)}</div>`
        : '';
      return `
        <div class="card">
          <div class="card-header">
            <div class="door-name">${escapeHtml(door.name)}</div>
            <span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>
          </div>
          <div class="meta">Since ${escapeHtml(door.stateSince || 'N/A')}</div>
          ${duration}
        </div>`;
    })
    .join('');
}

function renderTimeline(events: DashboardEvent[]): string {
  if (events.length === 0) {
    return '<div class="empty">No recent activity recorded.</div>';
  }

  return events
    .map((event) => {
      const status = (event.status || '').toUpperCase();
      const relative = formatRelativeTime(event.createdAt);
      return `
        <div class="timeline-item">
          <div class="timeline-main">
            <span class="timeline-door">${escapeHtml(event.doorName)}</span>
            <span class="timeline-action action-${statusClass(status).replace('status-', '')}">${escapeHtml(status)}</span>
          </div>
          <div class="timeline-time">
            ${escapeHtml(event.createdAt)}
            <span class="timeline-relative">${escapeHtml(relative)}</span>
          </div>
        </div>`;
    })
    .join('');
}

async function loadDashboard(): Promise<void> {
  const summary = document.getElementById('summary');
  const grid = document.getElementById('door-grid');
  const timeline = document.getElementById('timeline');
  if (!summary || !grid || !timeline) return;

  try {
    const data = await apiFetch<DashboardResponse>('/api/dashboard');
    summary.textContent = renderSummary(data.doors);
    summary.classList.toggle(
      'summary-open',
      data.doors.some((door) => door.status.toUpperCase() === 'OPEN'),
    );
    grid.innerHTML = renderDoors(data.doors);
    timeline.innerHTML = renderTimeline(data.recentEvents);
  } catch (err) {
    summary.textContent = err instanceof Error ? err.message : 'Failed to load dashboard';
    summary.classList.add('summary-error');
  }
}

void loadDashboard();
