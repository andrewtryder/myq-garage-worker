const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

export function withSecurityHeaders(
  headers: HeadersInit = {},
  extras: Record<string, string> = {},
): Headers {
  const result = new Headers(headers);
  for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    if (!result.has(key)) {
      result.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(extras)) {
    result.set(key, value);
  }
  return result;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: withSecurityHeaders({ 'Content-Type': 'application/json; charset=utf-8' }, extras),
  });
}

export function textResponse(
  body: string,
  status = 200,
  contentType = 'text/plain; charset=utf-8',
  extras: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: withSecurityHeaders({ 'Content-Type': contentType }, extras),
  });
}

export function htmlResponse(body: string, status = 200): Response {
  return textResponse(body, status, 'text/html; charset=utf-8');
}

export function notFoundResponse(): Response {
  return jsonResponse({ error: 'Not found' }, 404);
}

export function methodNotAllowedResponse(allow: string[]): Response {
  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: allow.join(', ') });
}

export const MAX_JSON_BODY_BYTES = 16_384;

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Content-Type must be application/json' }, 415),
    };
  }

  const raw = await request.arrayBuffer();
  if (raw.byteLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Request body too large' }, 413),
    };
  }

  try {
    const text = new TextDecoder().decode(raw);
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid JSON body' }, 400),
    };
  }
}
