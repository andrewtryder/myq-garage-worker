/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';
import { createMockD1 } from './mock-d1';
import { saveDoorState } from '../src/storage';
import { saveAlertConfig } from '../src/alert-config';

describe('myq-garage-worker integration tests', () => {
  let mockDb: any;
  let d1State: any;

  beforeEach(() => {
    ({ mockDb, state: d1State } = createMockD1());
  });

  function baseEnv(extra: Record<string, unknown> = {}) {
    return {
      GARAGE_DB: mockDb,
      ASSETS: {
        fetch: vi.fn(
          async () =>
            new Response('<html>Garage Status</html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            }),
        ),
      },
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
      ...extra,
    };
  }

  describe('Email Handler', () => {
    it('rejects emails not from the exact MyQ envelope sender', async () => {
      const mockEnv: any = baseEnv();
      const setReject = vi.fn();
      const message: any = {
        from: 'notification@myq.com.attacker.example',
        to: 'garage@example.com',
        setReject,
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Right just opened',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      expect(setReject).toHaveBeenCalledWith('Unsupported sender');
      expect(d1State.door_events.length).toBe(0);
    });

    it('rejects wrong envelope recipient when ALLOWED_EMAIL_TO is set', async () => {
      const mockEnv: any = baseEnv({ ALLOWED_EMAIL_TO: 'garage@example.com' });
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
    });

    it('rejects failed Authentication-Results', async () => {
      const mockEnv: any = baseEnv();
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
    });

    it('processes Right Garage Door opened events', async () => {
      const mockEnv: any = baseEnv();
      const message: any = {
        from: 'notification@myq.com',
        to: 'garage@example.com',
        setReject: vi.fn(),
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Right just opened',
          'message-id': '<first@example.com>',
        }),
      };

      await worker.email(message, mockEnv, {} as any);

      expect(d1State.doors.get('garage-right')?.current_status).toBe('OPEN');
      expect(d1State.door_events.some((event: any) => event.door_id === 'garage-right')).toBe(true);
    });

    it('skips duplicate Message-ID deliveries', async () => {
      const mockEnv: any = baseEnv({
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
      });
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

      expect(
        d1State.door_events.filter((event: any) => event.door_id === 'garage-left').length,
      ).toBe(1);
    });

    it('processes Left Garage Door closed events', async () => {
      const mockEnv: any = baseEnv();
      const message: any = {
        from: 'notification@myq.com',
        setReject: vi.fn(),
        headers: new Headers({
          subject: 'myQ Notification: Garage Door Left just closed',
        }),
      };

      await worker.email(message, mockEnv, {} as any);
      expect(d1State.doors.get('garage-left')?.current_status).toBe('CLOSED');
    });
  });

  describe('Fetch Handler (HTTP UI)', () => {
    it('proxies GET / to ASSETS for the static dashboard', async () => {
      const mockEnv: any = baseEnv();
      const req = new Request('https://worker.dev/');
      const response = await worker.fetch(req, mockEnv, {} as any);
      expect(response.status).toBe(200);
      expect(mockEnv.ASSETS.fetch).toHaveBeenCalledWith(req);
      expect(await response.text()).toContain('Garage Status');
    });

    it('returns 404 for unknown paths and 405 for wrong methods', async () => {
      const mockEnv: any = baseEnv();
      expect(
        (await worker.fetch(new Request('https://worker.dev/nope'), mockEnv, {} as any)).status,
      ).toBe(404);
      const methodNotAllowed = await worker.fetch(
        new Request('https://worker.dev/devices', { method: 'POST', body: '{}' }),
        mockEnv,
        {} as any,
      );
      expect(methodNotAllowed.status).toBe(405);
    });

    it('GET /api/dashboard returns door DTOs without API key', async () => {
      const mockEnv: any = baseEnv({
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      });
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      const response = await worker.fetch(
        new Request('https://worker.dev/api/dashboard'),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        doors: Array<{ id: string; status: string }>;
        stale: boolean;
        openCount: number;
      };
      expect(json.doors[0]).toMatchObject({ id: 'garage-left', status: 'OPEN' });
      expect(json.openCount).toBe(1);
      expect(typeof json.stale).toBe('boolean');
    });

    it('GET /health returns diagnostics without secrets', async () => {
      const mockEnv: any = baseEnv({
        VERSION: '1.1.0',
        API_KEY: 'super-secret',
        ALLOWED_EMAIL_TO: 'garage@example.com',
      });
      const response = await worker.fetch(
        new Request('https://worker.dev/health'),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        version: string;
        d1Ok: boolean;
        hasApiKey: boolean;
        hasAllowedEmailTo: boolean;
      };
      expect(json.version).toBe('1.1.0');
      expect(json.d1Ok).toBe(true);
      expect(json.hasApiKey).toBe(true);
      expect(json.hasAllowedEmailTo).toBe(true);
      const body = JSON.stringify(json);
      expect(body).not.toContain('super-secret');
      expect(body).not.toContain('garage@example.com');
    });

    it('returns 401 for GET /devices when API_KEY is missing', async () => {
      const mockEnv: any = baseEnv({ GARAGE_DOORS: { 'Garage Door Left': 'garage-left' } });
      const response = await worker.fetch(
        new Request('https://worker.dev/devices'),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(401);
    });

    it('GET /devices with Bearer auth returns HA-compatible JSON array', async () => {
      const mockEnv: any = baseEnv({ API_KEY: 'super-secret' });
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      await saveDoorState(mockEnv, 'garage-right', 'CLOSED', { source: 'simulate' });

      const response = await worker.fetch(
        new Request('https://worker.dev/devices', {
          headers: { Authorization: 'Bearer super-secret' },
        }),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { id: 'garage-left', name: 'Garage Door Left', status: 'open' },
        { id: 'garage-right', name: 'Garage Door Right', status: 'closed' },
      ]);
    });

    it('allows deprecated ?json=true with Authorization Bearer token', async () => {
      const mockEnv: any = baseEnv({
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      });
      const response = await worker.fetch(
        new Request('https://worker.dev/?json=true', {
          headers: { Authorization: 'Bearer super-secret' },
        }),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    it('allows POST /api/test-alert without API key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, status: 200 })),
      );
      const mockEnv: any = baseEnv({
        GARAGE_DOORS: { 'Garage Door Left': 'garage-left' },
        API_KEY: 'super-secret',
      });
      const response = await worker.fetch(
        new Request('https://worker.dev/api/test-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl: 'https://example.com/webhook',
            thresholdMinutes: 60,
            method: 'POST',
            doorName: 'Garage Door Left',
          }),
        }),
        mockEnv,
        {} as any,
      );
      const json = (await response.json()) as { result: { sent: boolean } };
      expect(response.status).toBe(200);
      expect(json.result.sent).toBe(true);
      vi.unstubAllGlobals();
    });

    it('rejects private webhook destinations on /api/alert-config', async () => {
      const mockEnv: any = baseEnv({ GARAGE_DOORS: { 'Garage Door Left': 'garage-left' } });
      const response = await worker.fetch(
        new Request('https://worker.dev/api/alert-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl: 'https://127.0.0.1/hook',
            thresholdMinutes: 45,
            method: 'GET',
          }),
        }),
        mockEnv,
        {} as any,
      );
      expect(response.status).toBe(400);
    });

    it('POST /api/alert-config saves config and redacts URL in response', async () => {
      const mockEnv: any = baseEnv({ GARAGE_DOORS: { 'Garage Door Left': 'garage-left' } });
      const response = await worker.fetch(
        new Request('https://worker.dev/api/alert-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl: 'https://ntfy.sh/super-secret-topic',
            thresholdMinutes: 45,
            method: 'GET',
          }),
        }),
        mockEnv,
        {} as any,
      );
      const json = (await response.json()) as {
        success: boolean;
        config: { method: string; webhookUrl: string };
      };
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.config.method).toBe('GET');
      expect(json.config.webhookUrl).toBe('https://ntfy.sh/***');
    });

    it('GET /api/alert-config returns saved public config', async () => {
      const mockEnv: any = baseEnv({ GARAGE_DOORS: { 'Garage Door Left': 'garage-left' } });
      await saveAlertConfig(mockEnv, {
        webhookUrl: 'https://ntfy.sh/secret',
        thresholdMinutes: 30,
        method: 'POST',
      });
      const response = await worker.fetch(
        new Request('https://worker.dev/api/alert-config'),
        mockEnv,
        {} as any,
      );
      const json = (await response.json()) as {
        config: { webhookUrl: string };
        doorNames: string[];
      };
      expect(json.config.webhookUrl).toBe('https://ntfy.sh/***');
      expect(json.doorNames).toContain('Garage Door Left');
    });
  });
});
