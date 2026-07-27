import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError, escapeHtml, statusClass } from '../frontend/src/api';

describe('frontend api helpers', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('escapeHtml escapes markup', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('statusClass maps statuses', () => {
    expect(statusClass('OPEN')).toBe('status-open');
    expect(statusClass('closed')).toBe('status-closed');
  });

  it('apiFetch returns JSON on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(apiFetch('/api/dashboard')).resolves.toEqual({ ok: true });
  });

  it('apiFetch throws ApiError on failure', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Nope' }), { status: 400 }),
    );
    await expect(apiFetch('/api/dashboard')).rejects.toBeInstanceOf(ApiError);
  });
});
