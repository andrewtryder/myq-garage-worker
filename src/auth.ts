import { Env } from './types';
import { loadConfig } from './config';

/** Routes that require a Worker API_KEY (Home Assistant / machine clients). */
export function routeRequiresApiKey(request: Request): boolean {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/devices') return true;
  if (request.method === 'GET' && url.pathname === '/' && url.searchParams.get('json') === 'true') {
    return true;
  }

  return false;
}

export function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s*(.*)$/i);
    if (match) {
      const bearer = match[1].trim();
      if (bearer) return bearer;
    } else {
      // Non-Bearer Authorization is ignored for API key auth.
    }
  }

  const headerKey = request.headers.get('x-api-key');
  if (headerKey) {
    const trimmed = headerKey.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

/**
 * Fail closed for machine endpoints: missing API_KEY or wrong key => unauthorized.
 * Query-string keys are intentionally unsupported.
 */
export function isApiKeyAuthorized(request: Request, env: Env): boolean {
  const { apiKey } = loadConfig(env);
  if (!apiKey) return false;

  const provided = extractApiKey(request);
  return provided !== null && provided === apiKey;
}
