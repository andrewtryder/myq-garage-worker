import { loadConfig } from './config';
import { DoorStatus, Env } from './types';

export interface MyQParsedSubject {
  deviceName: string;
  action: string;
}

export const MYQ_ENVELOPE_SENDER = 'notification@myq.com';

export function normalizeEnvelopeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** @deprecated Use normalizeEnvelopeAddress */
export function normalizeEnvelopeSender(from: string): string {
  return normalizeEnvelopeAddress(from);
}

export function isMyQEnvelopeSender(from: string): boolean {
  return normalizeEnvelopeAddress(from) === MYQ_ENVELOPE_SENDER;
}

/**
 * Extract a bare email address from an RFC 5322 From-style header value.
 * Supports `user@host` and `Display Name <user@host>`.
 */
export function parseAddressFromHeader(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const angle = trimmed.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angle) {
    return normalizeEnvelopeAddress(angle[1]);
  }

  // Bare address (optionally with surrounding quotes stripped)
  const bare = trimmed.replace(/^"|"$/g, '').trim();
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(bare)) {
    return normalizeEnvelopeAddress(bare);
  }

  return null;
}

export function isMyQHeaderFrom(headerFrom: string | null | undefined): boolean {
  return parseAddressFromHeader(headerFrom) === MYQ_ENVELOPE_SENDER;
}

export interface AcceptableMyQSenderInput {
  envelopeFrom: string;
  headerFrom: string | null | undefined;
  allowedForwardFrom: string | undefined;
}

/**
 * Accept direct myQ envelope MAIL FROM, or a configured forwarder envelope
 * whose header From is exactly notification@myq.com.
 */
export function isAcceptableMyQSender(input: AcceptableMyQSenderInput): boolean {
  if (isMyQEnvelopeSender(input.envelopeFrom)) {
    return true;
  }

  if (!input.allowedForwardFrom) {
    return false;
  }

  return (
    normalizeEnvelopeAddress(input.envelopeFrom) ===
      normalizeEnvelopeAddress(input.allowedForwardFrom) && isMyQHeaderFrom(input.headerFrom)
  );
}

export function isAllowedRecipient(to: string, allowedEmailTo: string | undefined): boolean {
  if (!allowedEmailTo) return true;
  return normalizeEnvelopeAddress(to) === allowedEmailTo;
}

/**
 * When Authentication-Results is present, reject clear DKIM/DMARC failures.
 * Missing header is allowed (Cloudflare Email Routing does not always surface it).
 */
export function hasFailedEmailAuthentication(authenticationResults: string | null): boolean {
  if (!authenticationResults) return false;
  const lower = authenticationResults.toLowerCase();
  return /\bdkim\s*=\s*fail\b/.test(lower) || /\bdmarc\s*=\s*fail\b/.test(lower);
}

export function parseMyQSubject(subject: string): MyQParsedSubject | null {
  const pattern = /myq notification:\s*(.+?)\s+(?:just\s+)?(opened|closed|stopped)/i;
  const match = subject.match(pattern);

  if (!match) {
    return null;
  }

  return {
    deviceName: match[1],
    action: match[2].toLowerCase(),
  };
}

// Global cache for resolving garage doors to avoid repetitive JSON parsing and string lowercasing
let cachedDoorsRawEnvValue: string | Record<string, string> | undefined;
let cachedLowercasedDoors: Record<string, string> | null = null;

// Reset function used primarily for tests to ensure test isolation
export function resetDoorKeyCache(): void {
  cachedDoorsRawEnvValue = undefined;
  cachedLowercasedDoors = null;
}

export function resolveDoorKey(deviceName: string, env: Env): string | null {
  if (cachedDoorsRawEnvValue !== env.GARAGE_DOORS || cachedLowercasedDoors === null) {
    const configuredDoors = loadConfig(env).garageDoors;

    const lowercasedMap: Record<string, string> = {};
    for (const [name, key] of Object.entries(configuredDoors)) {
      lowercasedMap[name.toLowerCase()] = key;
    }

    cachedLowercasedDoors = lowercasedMap;
    cachedDoorsRawEnvValue = env.GARAGE_DOORS;
  }

  const targetNameLower = deviceName.toLowerCase();
  return cachedLowercasedDoors[targetNameLower] || null;
}

export function mapActionToStatus(action: string): DoorStatus {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction === 'opened') {
    return 'OPEN';
  } else if (normalizedAction === 'closed') {
    return 'CLOSED';
  } else if (normalizedAction === 'stopped') {
    return 'STOPPED';
  }
  return 'UNKNOWN';
}
