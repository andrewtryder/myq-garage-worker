/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';
import { createMockKv } from './mock-kv';

describe('myq-garage-worker integration tests', () => {
  let mockKV: any;
  let kvStore: Map<string, string>;

  beforeEach(() => {
    ({ store: kvStore, mockKV } = createMockKv());
  });

  describe('Email Handler', () => {
    it('rejects emails not from the exact MyQ envelope sender', async () => {
      const mockEnv: any = { GARAGE_STATE: mockKV };
      const setReject = vi.fn();
      const message: any = {
        from: 'notification@myq.com.attacker.example',
        to: 'garage@example.com',
        setReject,
        headers: new Headers({
          from: 'notification@myq.com',
          subject: 'myQ Notification: Garage Door Right just opened',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      expect(setReject).toHaveBeenCalledWith('Unsupported sender');
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('rejects wrong envelope recipient when ALLOWED_EMAIL_TO is set', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        ALLOWED_EMAIL_TO: 'garage@example.com',
      };
      const setReject = vi.fn();
      const message: any = {
        from: 'notification@myq.com',
        to: 'other@example.com',
        setReject,
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Left just opened',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      expect(setReject).toHaveBeenCalledWith('Unsupported recipient');
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('rejects failed Authentication-Results', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };
      const setReject = vi.fn();
      const message: any = {
        from: 'notification@myq.com',
        to: 'garage@example.com',
        setReject,
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Left just opened',
          'authentication-results': 'mx.google.com; dkim=fail header.d=myq.com',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      expect(setReject).toHaveBeenCalledWith('Failed email authentication');
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('processes Right Garage Door opened events', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const message: any = {
        from: 'notification@myq.com',
        to: 'garage@example.com',
        setReject: vi.fn(),
        headers: new Headers({
          from: 'MyQ <notification@myq.com>',
          subject: 'myQ Notification: Garage Door Right just opened',
          'message-id': '<first@example.com>',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('garage-right', expect.any(String));
      expect([...kvStore.keys()].some((key) => key.startsWith('eventr:garage-right:'))).toBe(true);

      const parsed = JSON.parse(kvStore.get('garage-right') || '');
      expect(parsed.value).toBe('OPEN');
      expect([...kvStore.keys()].some((key) => key.startsWith('msgid:done:'))).toBe(true);
    });

    it('skips duplicate Message-ID deliveries', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };
      const message: any = {
        from: 'notification@myq.com',
        setReject: vi.fn(),
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Left just opened',
          'message-id': '<dup@example.com>',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      await worker.email(message, mockEnv, {} as any);

      const statePuts = mockKV.put.mock.calls.filter((call: string[]) => call[0] === 'garage-left');
      expect(statePuts.length).toBe(1);
    });

    it('aborts pending Message-ID when subject does not match', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };
      const message: any = {
        from: 'notification@myq.com',
        setReject: vi.fn(),
        headers: new Headers({
          subject: 'Unrelated subject line',
          'message-id': '<bad-subject@example.com>',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect([...kvStore.keys()].some((key) => key.startsWith('msgid:pending:'))).toBe(false);
      expect([...kvStore.keys()].some((key) => key.startsWith('msgid:done:'))).toBe(false);

      message.headers = new Headers({
        subject: 'myQ Notification: Garage Door Left just opened',
        'message-id': '<bad-subject@example.com>',
      });
      await worker.email(message, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('garage-left', expect.any(String));
      expect([...kvStore.keys()].some((key) => key.startsWith('msgid:done:'))).toBe(true);
    });

    it('aborts pending Message-ID when device name is unknown', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };
      const message: any = {
        from: 'notification@myq.com',
        setReject: vi.fn(),
        headers: new Headers({
          subject: 'myQ Notification: Mystery Door just opened',
          'message-id': '<unknown-door@example.com>',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect([...kvStore.keys()].some((key) => key.startsWith('msgid:pending:'))).toBe(false);

      message.headers = new Headers({
        subject: 'myQ Notification: Garage Door Left just opened',
        'message-id': '<unknown-door@example.com>',
      });
      await worker.email(message, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('garage-left', expect.any(String));
    });

    it('processes Left Garage Door closed events', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const message: any = {
        from: 'notification@myq.com',
        setReject: vi.fn(),
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Left just closed',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect(mockKV.put).toHaveBeenCalledWith('garage-left', expect.any(String));
      const parsed = JSON.parse(kvStore.get('garage-left') || '');
      expect(parsed.value).toBe('CLOSED');
    });
  });

  describe('Fetch Handler (HTTP UI)', () => {
    it('serves HTML status page by default for dynamically configured doors', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      };
      const req = new Request('https://worker.dev');

      const response = await worker.fetch(req, mockEnv, {} as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');

      const text = await response.text();
      expect(text).toContain('Garage Door Right');
      expect(text).toContain('Garage Door Left');
      expect(text).not.toContain('Unlock');
      expect(text).not.toContain('sessionStorage');
    });

    it('serves HTML status page for single door JSON object string', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: JSON.stringify({ 'Garage Door Left': 'garage-left' }),
      };
      const req = new Request('https://worker.dev');
      const response = await worker.fetch(req, mockEnv, {} as any);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Garage Door Left');
    });

    it('returns 404 for unknown paths and 405 for wrong methods', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };

      const notFound = await worker.fetch(
        new Request('https://worker.dev/nope'),
        mockEnv,
        {} as any,
      );
      expect(notFound.status).toBe(404);

      const methodNotAllowed = await worker.fetch(
        new Request('https://worker.dev/devices', { method: 'POST', body: '{}' }),
        mockEnv,
        {} as any,
      );
      expect(methodNotAllowed.status).toBe(405);
      expect(methodNotAllowed.headers.get('Allow')).toContain('GET');
    });

    it('returns dashboard HTML without API key (Access is operator-owned)', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      };
      const response = await worker.fetch(new Request('https://worker.dev/'), mockEnv, {} as any);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Garage Door Status');
    });

    it('returns 401 for GET /devices when API_KEY is missing', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };
      const response = await worker.fetch(
        new Request('https://worker.dev/devices'),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 for GET /devices without auth when API_KEY is set', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      };
      const response = await worker.fetch(
        new Request('https://worker.dev/devices'),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(401);
    });

    it('rejects query-string API keys', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      };
      const response = await worker.fetch(
        new Request('https://worker.dev/devices?key=super-secret'),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(401);
    });

    it('allows ?json=true with Authorization Bearer token', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      };
      const req = new Request('https://worker.dev/?json=true', {
        headers: { Authorization: 'Bearer super-secret' },
      });
      const response = await worker.fetch(req, mockEnv, {} as any);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    it('allows access with x-api-key header on /devices', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      };
      const req = new Request('https://worker.dev/devices', {
        headers: { 'x-api-key': 'super-secret' },
      });
      const response = await worker.fetch(req, mockEnv, {} as any);
      expect(response.status).toBe(200);
    });

    it('GET /devices with Bearer auth returns HA-compatible JSON array', async () => {
      kvStore.set(
        'garage-left',
        JSON.stringify({ value: 'OPEN', createdAt: '2023-01-01T00:00:00.000Z' }),
      );
      kvStore.set(
        'garage-right',
        JSON.stringify({ value: 'CLOSED', createdAt: '2023-01-01T00:00:00.000Z' }),
      );

      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
        API_KEY: 'super-secret',
      };

      const req = new Request('https://worker.dev/devices', {
        headers: { Authorization: 'Bearer super-secret' },
      });
      const response = await worker.fetch(req, mockEnv, {} as any);

      expect(response.status).toBe(200);
      const json = (await response.json()) as Array<{ id: string; name: string; status: string }>;
      expect(json).toEqual([
        { id: 'garage-left', name: 'Garage Door Left', status: 'open' },
        { id: 'garage-right', name: 'Garage Door Right', status: 'closed' },
      ]);
    });

    it('omits STOPPED doors from GET /devices response', async () => {
      kvStore.set(
        'garage-left',
        JSON.stringify({ value: 'STOPPED', createdAt: '2023-01-01T00:00:00.000Z' }),
      );
      kvStore.set(
        'garage-right',
        JSON.stringify({ value: 'CLOSED', createdAt: '2023-01-01T00:00:00.000Z' }),
      );

      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
        API_KEY: 'super-secret',
      };

      const req = new Request('https://worker.dev/devices', {
        headers: { Authorization: 'Bearer super-secret' },
      });
      const response = await worker.fetch(req, mockEnv, {} as any);
      const json = (await response.json()) as Array<{ id: string; name: string; status: string }>;

      expect(json).toEqual([{ id: 'garage-right', name: 'Garage Door Right', status: 'closed' }]);
    });

    it('allows POST /test-alert without API key (Access protects browser)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            status: 200,
          }),
        ),
      );

      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      };

      const req = new Request('https://worker.dev/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://example.com/webhook',
          thresholdMinutes: 60,
          method: 'POST',
          doorName: 'Garage Door Left',
        }),
      });

      const response = await worker.fetch(req, mockEnv, {} as any);
      const json = (await response.json()) as { result: { sent: boolean } };

      expect(response.status).toBe(200);
      expect(json.result.sent).toBe(true);

      vi.unstubAllGlobals();
    });

    it('rejects private webhook destinations', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };

      const req = new Request('https://worker.dev/alert-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://127.0.0.1/hook',
          thresholdMinutes: 45,
          method: 'GET',
        }),
      });

      const response = await worker.fetch(req, mockEnv, {} as any);
      expect(response.status).toBe(400);
    });

    it('POST /alert-config saves config and redacts URL in response', async () => {
      const mockEnv: any = {
        GARAGE_STATE: mockKV,
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      };

      const req = new Request('https://worker.dev/alert-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://ntfy.sh/super-secret-topic',
          thresholdMinutes: 45,
          method: 'GET',
        }),
      });

      const response = await worker.fetch(req, mockEnv, {} as any);
      const json = (await response.json()) as {
        success: boolean;
        config: { method: string; webhookUrl: string };
      };

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.config.method).toBe('GET');
      expect(json.config.webhookUrl).toBe('https://ntfy.sh/***');
    });
  });
});
