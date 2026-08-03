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
  /** Optional subject; used when Gmail rewrites header From but keeps the myQ subject. */
  subject?: string | null;
}

/**
 * Normalize an envelope MAIL FROM to a bare lowercase address when possible.
 * Also unwraps common SRS0 rewrite forms used by forwarders.
 */
export function normalizeMaybeAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const trimmed = raw.trim();

  // SRS0=HHH=TT=domain=local@forwarder-host
  const srs = trimmed.match(/SRS0=[^=\s]+=[^=\s]+=([^=\s]+)=([^@\s]+)@/i);
  if (srs) {
    return normalizeEnvelopeAddress(`${srs[2]}@${srs[1]}`);
  }

  const parsed = parseAddressFromHeader(trimmed);
  if (parsed) return parsed;
  const normalized = normalizeEnvelopeAddress(trimmed);
  return normalized.includes('@') ? normalized : null;
}

function parseAllowedForwardFromList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => normalizeMaybeAddress(part))
    .filter((part): part is string => Boolean(part));
}

/** Gmail ignores dots in the local part; treat a.b@gmail.com ≡ ab@gmail.com. */
function gmailLocalKey(address: string): string | null {
  const at = address.lastIndexOf('@');
  if (at <= 0) return null;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return null;
  return `${local.replace(/\./g, '')}@gmail.com`;
}

function envelopeMatchesAllowed(envelope: string, allowedList: string[]): boolean {
  if (allowedList.includes(envelope)) return true;
  const envelopeGmail = gmailLocalKey(envelope);
  if (!envelopeGmail) return false;
  return allowedList.some((allowed) => gmailLocalKey(allowed) === envelopeGmail);
}

/**
 * Accept direct myQ envelope MAIL FROM, or a configured forwarder envelope
 * whose header From is notification@myq.com (or whose subject is a myQ notification
 * when the forwarder rewrites From).
 *
 * `allowedForwardFrom` may be a comma-separated list of addresses.
 */
export function isAcceptableMyQSender(input: AcceptableMyQSenderInput): boolean {
  const envelope = normalizeMaybeAddress(input.envelopeFrom);
  if (envelope === MYQ_ENVELOPE_SENDER) {
    return true;
  }

  if (!input.allowedForwardFrom) {
    return false;
  }

  const allowedList = parseAllowedForwardFromList(input.allowedForwardFrom);
  if (!envelope || allowedList.length === 0 || !envelopeMatchesAllowed(envelope, allowedList)) {
    return false;
  }

  if (isMyQHeaderFrom(input.headerFrom)) {
    return true;
  }

  // Gmail filter forward sometimes rewrites From to the account address.
  return Boolean(input.subject && parseMyQSubject(input.subject));
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
