const MAX_WEBHOOK_URL_LENGTH = 2048;
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'unix']);

function isIpv4(hostname: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

function parseIpv4(hostname: string): number[] | null {
  if (!isIpv4(hostname)) return null;
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isPrivateOrReservedIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === '::1' || host === '[::1]' || host.includes(':')) {
    // Block IPv6 literals (including link-local / unique-local) for simplicity.
    return true;
  }

  const ipv4 = parseIpv4(host);
  if (ipv4 && isPrivateOrReservedIpv4(ipv4)) {
    return true;
  }

  return false;
}

export function assertSafeWebhookUrl(webhookUrl: string): URL {
  if (!webhookUrl || webhookUrl.length > MAX_WEBHOOK_URL_LENGTH) {
    throw new Error('Invalid webhook URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Webhook URL must not include credentials');
  }

  if (parsed.port && parsed.port !== '443') {
    throw new Error('Webhook URL must use port 443');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('Webhook URL host is not allowed');
  }

  return parsed;
}

/** Mask path segments that look like secret topics/tokens for display. */
export function redactWebhookUrl(webhookUrl: string): string {
  try {
    const url = new URL(webhookUrl);
    if (url.pathname && url.pathname !== '/') {
      url.pathname = url.pathname
        .split('/')
        .map((segment, index) => (index === 0 || !segment ? segment : '***'))
        .join('/');
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[redacted]';
  }
}

export const WEBHOOK_FETCH_TIMEOUT_MS = 5_000;
