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
