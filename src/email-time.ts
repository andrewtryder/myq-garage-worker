/** Default max |Date − received_at| for trusting the email Date header. */
export const DEFAULT_EVENT_TIME_SKEW_HOURS = 6;

/**
 * Parse an RFC 5322 Date header value into a Date, or null if unusable.
 */
export function parseEmailDateHeader(raw: string | null | undefined): Date | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/**
 * Choose the chronology/ordering timestamp for an email write.
 * Prefer a parseable Date header within skew of Worker receipt; otherwise received_at.
 */
export function resolveOrderingTime(
  dateHeader: string | null | undefined,
  receivedAtIso: string,
  skewHours: number = DEFAULT_EVENT_TIME_SKEW_HOURS,
): string {
  const receivedMs = Date.parse(receivedAtIso);
  if (!Number.isFinite(receivedMs)) return receivedAtIso;

  const skew =
    Number.isFinite(skewHours) && skewHours > 0 ? skewHours : DEFAULT_EVENT_TIME_SKEW_HOURS;
  const skewMs = skew * 60 * 60 * 1000;

  const candidate = parseEmailDateHeader(dateHeader);
  if (!candidate) return receivedAtIso;

  if (Math.abs(candidate.getTime() - receivedMs) > skewMs) {
    return receivedAtIso;
  }

  return candidate.toISOString();
}
