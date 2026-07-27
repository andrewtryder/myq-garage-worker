import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVENT_TIME_SKEW_HOURS,
  parseEmailDateHeader,
  resolveOrderingTime,
} from '../src/email-time';

describe('email-time', () => {
  it('parses RFC 5322 Date headers', () => {
    const parsed = parseEmailDateHeader('Mon, 27 Jul 2026 15:00:00 -0400');
    expect(parsed).not.toBeNull();
    expect(parsed!.toISOString()).toBe('2026-07-27T19:00:00.000Z');
  });

  it('returns null for empty or invalid Date headers', () => {
    expect(parseEmailDateHeader(null)).toBeNull();
    expect(parseEmailDateHeader('')).toBeNull();
    expect(parseEmailDateHeader('not-a-date')).toBeNull();
  });

  it('prefers Date within skew of received_at', () => {
    const receivedAt = '2026-07-27T20:00:00.000Z';
    const dateHeader = 'Mon, 27 Jul 2026 15:30:00 -0400'; // 19:30Z
    expect(resolveOrderingTime(dateHeader, receivedAt, 6)).toBe('2026-07-27T19:30:00.000Z');
  });

  it('falls back to received_at when Date is outside skew', () => {
    const receivedAt = '2026-07-27T20:00:00.000Z';
    const farPast = 'Sun, 26 Jul 2026 08:00:00 -0400'; // ~36h earlier
    expect(resolveOrderingTime(farPast, receivedAt, DEFAULT_EVENT_TIME_SKEW_HOURS)).toBe(
      receivedAt,
    );

    const farFuture = 'Tue, 28 Jul 2026 20:00:00 -0400';
    expect(resolveOrderingTime(farFuture, receivedAt, 6)).toBe(receivedAt);
  });

  it('falls back when Date is missing', () => {
    const receivedAt = '2026-07-27T20:00:00.000Z';
    expect(resolveOrderingTime(null, receivedAt, 6)).toBe(receivedAt);
  });
});
