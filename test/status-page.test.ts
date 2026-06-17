import { describe, it, expect } from 'vitest';
import {
  renderStatusPage,
  statusColor,
  statusLabel,
  DoorData,
  HistoryEntry,
} from '../src/status-page';

describe('status-page unit tests', () => {
  describe('statusColor', () => {
    it('returns correct color for OPEN', () => {
      expect(statusColor('OPEN')).toBe('#ff4d4f');
    });

    it('returns correct color for CLOSED', () => {
      expect(statusColor('CLOSED')).toBe('#52c41a');
    });

    it('returns correct color for STOPPED', () => {
      expect(statusColor('STOPPED')).toBe('#faad14');
    });

    it('returns grey for unknown', () => {
      expect(statusColor('UNKNOWN')).toBe('#8c8c8c');
      expect(statusColor('broken')).toBe('#8c8c8c');
    });
  });

  describe('statusLabel', () => {
    it('uppercases known values', () => {
      expect(statusLabel('open')).toBe('OPEN');
    });

    it('handles undefined or empty string', () => {
      expect(statusLabel(undefined)).toBe('UNKNOWN');
      expect(statusLabel('')).toBe('UNKNOWN');
    });
  });

  describe('renderStatusPage', () => {
    it('renders empty history message when history is empty', () => {
      const html = renderStatusPage([], []);
      expect(html).toContain('No recent activity recorded.');
    });

    it('renders configured doors correctly', () => {
      const doors: DoorData[] = [
        {
          name: 'Main Garage',
          state: { value: 'OPEN', createdAt: '2023-01-01T00:00:00.000Z' },
        },
        {
          name: 'Shed Door',
          state: { value: 'CLOSED', createdAt: '2023-01-01T01:00:00.000Z' },
        },
      ];
      const html = renderStatusPage(doors, []);
      expect(html).toContain('Main Garage');
      expect(html).toContain('Shed Door');
      expect(html).toContain('OPEN');
      expect(html).toContain('CLOSED');
      expect(html).toContain('2023-01-01T00:00:00.000Z');
      expect(html).toContain('2023-01-01T01:00:00.000Z');
    });

    it('renders history correctly', () => {
      const history: HistoryEntry[] = [
        {
          doorName: 'Main Garage',
          value: 'OPEN',
          createdAt: '2023-01-01T00:00:00.000Z',
        },
      ];
      const html = renderStatusPage([], history);
      expect(html).toContain('Main Garage');
      expect(html).not.toContain('No recent activity recorded.');
    });
  });
});
