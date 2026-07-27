export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...options, headers });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

export function statusClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper === 'OPEN') return 'status-open';
  if (upper === 'CLOSED') return 'status-closed';
  if (upper === 'STOPPED') return 'status-stopped';
  return 'status-unknown';
}
