import { describe, it, expect } from 'vitest';
import { statusColor, statusLabel, renderStatusPage, formatDuration, formatRelativeTime } from '../src/status-page';

describe('status-page utils', () => {
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
    // 5000 ms -> Just now
    expect(formatDuration(5000)).toBe('Just now');
    // 60000 ms -> 1 min
    expect(formatDuration(60000)).toBe('1 min');
    // 120000 ms -> 2 mins
    expect(formatDuration(120000)).toBe('2 mins');
    // 3660000 ms -> 1 hr 1 min
    expect(formatDuration(3660000)).toBe('1 hr 1 min');
    // 90000000 ms -> 1 day 1 hr
    expect(formatDuration(90000000)).toBe('1 day 1 hr');
  });

  it('formatRelativeTime calculates compact relative labels', () => {
    const now = Date.parse('2025-01-01T12:00:00.000Z');
    expect(formatRelativeTime('2025-01-01T11:59:30.000Z', now)).toBe('(just now)');
    expect(formatRelativeTime('2025-01-01T11:55:00.000Z', now)).toBe('(5m ago)');
    expect(formatRelativeTime('2025-01-01T10:00:00.000Z', now)).toBe('(2h ago)');
    expect(formatRelativeTime('2024-12-31T10:00:00.000Z', now)).toBe('(1d 2h ago)');
  });

  describe('renderStatusPage HTML output', () => {
    it('renders empty states safely', () => {
      const html = renderStatusPage([], []);
      expect(html).toContain('Garage Door Status');
      expect(html).toContain('No recent activity recorded.');
      expect(html).toContain('id="dashboard-view"');
      expect(html).toContain('id="simulator-view"');
      expect(html).toContain('id="alerts-view"');
      expect(html).toContain('Alert Test');
    });

    it('renders doors successfully', () => {
      const doors = [
        {
          name: 'Main Door',
          state: { value: 'OPEN', createdAt: '2025-01-01T12:00:00Z' },
          durationText: '2 hrs',
        },
      ];
      const html = renderStatusPage(doors, []);
      expect(html).toContain('Main Door');
      expect(html).toContain('status-open');
      expect(html).toContain('OPEN');
      expect(html).toContain('2025-01-01T12:00:00Z');
      expect(html).toContain('Duration: 2 hrs');
    });

    it('renders history timeline successfully', () => {
      const history = [
        {
          doorName: 'Main Door',
          value: 'CLOSED',
          createdAt: '2025-01-01T12:30:00Z',
        },
      ];
      const html = renderStatusPage([], history);
      expect(html).toContain('Main Door');
      expect(html).toContain('timeline-action action-closed');
      expect(html).toContain('CLOSED');
      expect(html).toContain('2025-01-01T12:30:00Z');
      expect(html).toContain('timeline-relative');
    });

    it('renders configured door names in simulator select', () => {
      const html = renderStatusPage([], [], {
        doorNames: ['Garage Door Left', 'Garage Door Right'],
      });
      expect(html).toContain('<select id="simDoor"');
      expect(html).toContain('Garage Door Left');
      expect(html).not.toContain('simSubject');
    });
  });
});
