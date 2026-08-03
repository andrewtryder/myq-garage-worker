import { describe, it, expect } from 'vitest';
import {
  applyArguments,
  buildWebhookRequest,
  substitutePlaceholders,
} from '../src/webhook-payload';

describe('webhook-payload', () => {
  const ctx = {
    door: 'Garage Door Left',
    state: 'OPEN',
    minutes: '45 min',
    timestamp: '2025-01-01T12:00:00.000Z',
  };

  it('substitutes known placeholders and leaves unknown tokens', () => {
    expect(substitutePlaceholders('{{door}} is {{state}} {{unknown}}', ctx)).toBe(
      'Garage Door Left is OPEN {{unknown}}',
    );
  });

  it('applies placeholders across argument values', () => {
    expect(
      applyArguments(
        [
          { key: 'message', value: '{{door}} open {{minutes}}' },
          { key: 'ts', value: '{{timestamp}}' },
        ],
        ctx,
      ),
    ).toEqual([
      { key: 'message', value: 'Garage Door Left open 45 min' },
      { key: 'ts', value: '2025-01-01T12:00:00.000Z' },
    ]);
  });

  it('builds GET requests as query params', () => {
    const built = buildWebhookRequest({
      webhookUrl: 'https://example.com/hook',
      method: 'GET',
      contentType: 'application/json',
      arguments: [
        { key: 'door', value: '{{door}}' },
        { key: 'state', value: '{{state}}' },
      ],
      context: ctx,
    });
    expect(built.method).toBe('GET');
    expect(built.url).toContain('door=Garage+Door+Left');
    expect(built.url).toContain('state=OPEN');
    expect(built.body).toBeUndefined();
  });

  it('builds POST JSON bodies', () => {
    const built = buildWebhookRequest({
      webhookUrl: 'https://example.com/hook',
      method: 'POST',
      contentType: 'application/json',
      arguments: [
        { key: 'door', value: '{{door}}' },
        { key: 'minutes', value: '{{minutes}}' },
      ],
      context: ctx,
    });
    expect(built.headers?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(built.body!)).toEqual({
      door: 'Garage Door Left',
      minutes: '45 min',
    });
  });

  it('builds POST form-urlencoded bodies', () => {
    const built = buildWebhookRequest({
      webhookUrl: 'https://example.com/hook',
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      arguments: [{ key: 'message', value: '{{door}} {{state}}' }],
      context: ctx,
    });
    expect(built.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(built.body).toContain('message=Garage+Door+Left+OPEN');
  });

  it('builds text/plain from body arg or key=value lines', () => {
    const withBody = buildWebhookRequest({
      webhookUrl: 'https://example.com/hook',
      method: 'POST',
      contentType: 'text/plain',
      arguments: [
        { key: 'body', value: 'Alert: {{door}}' },
        { key: 'ignored', value: 'x' },
      ],
      context: ctx,
    });
    expect(withBody.body).toBe('Alert: Garage Door Left');

    const lines = buildWebhookRequest({
      webhookUrl: 'https://example.com/hook',
      method: 'POST',
      contentType: 'text/plain',
      arguments: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
      context: ctx,
    });
    expect(lines.body).toBe('a=1\nb=2');
  });
});
