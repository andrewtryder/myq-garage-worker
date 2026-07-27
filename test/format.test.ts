import { describe, it, expect } from 'vitest';
import { statusColor, statusLabel, formatDuration, formatRelativeTime } from '../src/format';

describe('format utils', () => {
  it('statusColor returns correct hex codes', () => {
    expect(statusColor('OPEN')).toBe('#ff4d4f');
    expect(statusColor('CLOSED')).toBe('#52c41a');
    expect(statusColor('STOPPED')).toBe('#faad14');
    expect(statusColor('UNKNOWN')).toBe('#8c8c8c');
    expect(statusColor('some-garbage')).toBe('#8c8c8c');
  });

  it('statusLabel formats correctly', () => {
    expect(statusLabel('open')).toBe('OPEN');
    expect(statusLabel(undefined)).toBe('UNKNOWN');
  });

  it('formatDuration calculates time string correctly', () => {
    expect(formatDuration(5000)).toBe('Just now');
    expect(formatDuration(60000)).toBe('1 min');
    expect(formatDuration(120000)).toBe('2 mins');
    expect(formatDuration(3660000)).toBe('1 hr 1 min');
    expect(formatDuration(90000000)).toBe('1 day 1 hr');
  });

  it('formatRelativeTime calculates compact relative labels', () => {
    const now = Date.parse('2025-01-01T12:00:00.000Z');
    expect(formatRelativeTime('2025-01-01T11:59:30.000Z', now)).toBe('(just now)');
    expect(formatRelativeTime('2025-01-01T11:55:00.000Z', now)).toBe('(5m ago)');
    expect(formatRelativeTime('2025-01-01T10:00:00.000Z', now)).toBe('(2h ago)');
    expect(formatRelativeTime('2024-12-31T10:00:00.000Z', now)).toBe('(1d 2h ago)');
  });
});
