import { describe, it, expect } from 'vitest';
import { renderStatusPage, statusColor, statusLabel } from '../src/status-page';

describe('status-page unit tests', () => {
  describe('statusColor', () => {
    it('returns red for OPEN', () => {
      expect(statusColor('OPEN')).toBe('#ff4d4f');
    });

    it('returns green for CLOSED', () => {
      expect(statusColor('CLOSED')).toBe('#52c41a');
    });

    it('returns amber for STOPPED', () => {
      expect(statusColor('STOPPED')).toBe('#faad14');
    });

    it('returns grey for UNKNOWN or other values', () => {
      expect(statusColor('UNKNOWN')).toBe('#8c8c8c');
      expect(statusColor('GARBAGE')).toBe('#8c8c8c');
    });
  });

  describe('statusLabel', () => {
    it('returns UNKNOWN for undefined or empty input', () => {
      expect(statusLabel(undefined)).toBe('UNKNOWN');
      expect(statusLabel('')).toBe('UNKNOWN');
    });

    it('returns uppercase value for valid input', () => {
      expect(statusLabel('open')).toBe('OPEN');
      expect(statusLabel('Closed')).toBe('CLOSED');
    });
  });

  describe('renderStatusPage', () => {
    it('renders HTML structure containing both doors status and times', () => {
      const rightDoor = { value: 'OPEN', createdAt: '2026-06-06T14:00:00Z' };
      const leftDoor = { value: 'CLOSED', createdAt: '2026-06-06T15:30:00Z' };

      const html = renderStatusPage(rightDoor, leftDoor);

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Garage Door Right');
      expect(html).toContain('Garage Door Left');
      expect(html).toContain('status-open');
      expect(html).toContain('status-closed');
      expect(html).toContain('2026-06-06T14:00:00Z');
      expect(html).toContain('2026-06-06T15:30:00Z');
    });

    it('handles null values gracefully', () => {
      const html = renderStatusPage(null, null);

      expect(html).toContain('Garage Door Right');
      expect(html).toContain('Garage Door Left');
      expect(html).toContain('UNKNOWN');
      expect(html).toContain('Last update: N/A');
    });
  });
});
