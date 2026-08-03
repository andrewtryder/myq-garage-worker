export type WebhookContentType =
  'application/json' | 'application/x-www-form-urlencoded' | 'text/plain';

export interface WebhookArgument {
  key: string;
  value: string;
}

export interface PlaceholderContext {
  door: string;
  state: string;
  minutes: string;
  timestamp: string;
}

export function substitutePlaceholders(template: string, ctx: PlaceholderContext): string {
  return template
    .replaceAll('{{door}}', ctx.door)
    .replaceAll('{{state}}', ctx.state)
    .replaceAll('{{minutes}}', ctx.minutes)
    .replaceAll('{{timestamp}}', ctx.timestamp);
}

export function applyArguments(
  args: WebhookArgument[],
  ctx: PlaceholderContext,
): WebhookArgument[] {
  return args.map((arg) => ({
    key: arg.key,
    value: substitutePlaceholders(arg.value, ctx),
  }));
}

export interface BuiltWebhookRequest {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Resolved key/value pairs after placeholder substitution (for tests/UI). */
  resolvedArguments: WebhookArgument[];
}

/**
 * Build a webhook request from configured method, content type, and argument templates.
 * GET always uses query params. POST serializes by content type.
 */
export function buildWebhookRequest(input: {
  webhookUrl: string;
  method: 'GET' | 'POST';
  contentType: WebhookContentType;
  arguments: WebhookArgument[];
  context: PlaceholderContext;
}): BuiltWebhookRequest {
  const resolved = applyArguments(input.arguments, input.context);

  if (input.method === 'GET') {
    const url = new URL(input.webhookUrl);
    for (const arg of resolved) {
      if (!arg.key) continue;
      url.searchParams.set(arg.key, arg.value);
    }
    return {
      url: url.toString(),
      method: 'GET',
      resolvedArguments: resolved,
    };
  }

  if (input.contentType === 'application/json') {
    const obj: Record<string, string> = {};
    for (const arg of resolved) {
      if (!arg.key) continue;
      obj[arg.key] = arg.value;
    }
    return {
      url: input.webhookUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
      resolvedArguments: resolved,
    };
  }

  if (input.contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams();
    for (const arg of resolved) {
      if (!arg.key) continue;
      params.set(arg.key, arg.value);
    }
    return {
      url: input.webhookUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      resolvedArguments: resolved,
    };
  }

  // text/plain: prefer a single `body` argument; else key=value lines
  const bodyArg = resolved.find((arg) => arg.key === 'body');
  const textBody =
    bodyArg !== undefined
      ? bodyArg.value
      : resolved
          .filter((arg) => arg.key)
          .map((arg) => `${arg.key}=${arg.value}`)
          .join('\n');

  return {
    url: input.webhookUrl,
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: textBody,
    resolvedArguments: resolved,
  };
}

export const DEFAULT_WEBHOOK_ARGUMENTS: WebhookArgument[] = [
  { key: 'title', value: 'Garage Door Alert' },
  { key: 'message', value: '{{door}} has been {{state}} for {{minutes}}.' },
  { key: 'door', value: '{{door}}' },
  { key: 'state', value: '{{state}}' },
  { key: 'minutes', value: '{{minutes}}' },
  { key: 'timestamp', value: '{{timestamp}}' },
];
