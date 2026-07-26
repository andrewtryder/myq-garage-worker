import { describe, it, expect } from 'vitest';
import { assertSafeWebhookUrl, redactWebhookUrl } from '../src/webhook-url';

describe('webhook-url', () => {
  it('accepts https public URLs', () => {
    expect(assertSafeWebhookUrl('https://ntfy.sh/secret-topic').hostname).toBe('ntfy.sh');
  });

  it('rejects http, localhost, private, metadata, and credentialed URLs', () => {
    expect(() => assertSafeWebhookUrl('http://example.com/hook')).toThrow(/HTTPS/);
    expect(() => assertSafeWebhookUrl('https://localhost/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://127.0.0.1/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://192.168.1.1/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://169.254.169.254/latest')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://user:pass@example.com/hook')).toThrow(/credentials/);
    expect(() => assertSafeWebhookUrl('https://example.com:8443/hook')).toThrow(/port/);
  });

  it('rejects more private and reserved destinations', () => {
    expect(() => assertSafeWebhookUrl('https://10.0.0.1/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://172.16.5.1/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://100.64.1.1/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://224.0.0.1/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://foo.localhost/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://host.local/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://[::1]/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('https://0.0.0.0/hook')).toThrow(/not allowed/);
    expect(() => assertSafeWebhookUrl('not a url')).toThrow(/Invalid webhook URL/);
    expect(() => assertSafeWebhookUrl('')).toThrow(/Invalid webhook URL/);
  });

  it('rejects oversized webhook URLs', () => {
    const oversized = `https://example.com/${'a'.repeat(3000)}`;
    expect(() => assertSafeWebhookUrl(oversized)).toThrow(/Invalid webhook URL/);
  });

  it('redacts path segments that may contain secrets', () => {
    expect(redactWebhookUrl('https://ntfy.sh/my-secret-topic')).toBe('https://ntfy.sh/***');
  });

  it('redacts invalid URLs safely', () => {
    expect(redactWebhookUrl('not-a-url')).toBe('[redacted]');
    expect(redactWebhookUrl('https://example.com/')).toBe('https://example.com/');
  });
});
