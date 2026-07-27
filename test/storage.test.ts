/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDoorState,
  getDoorState,
  getDoorHistory,
  setAlertLatch,
  getAlertLatch,
  pruneOldEvents,
} from '../src/storage';
import { Env } from '../src/types';
import { createMockD1 } from './mock-d1';

describe('storage D1 tests', () => {
  let mockDb: any;
  let d1State: any;
  let mockEnv: Env;

  beforeEach(() => {
    ({ mockDb, state: d1State } = createMockD1());
    mockEnv = {
      GARAGE_DB: mockDb,
      ASSETS: { fetch: async () => new Response('ok') } as any,
      GARAGE_DOORS: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
    };
  });

  describe('saveDoorState / getDoorState', () => {
    it('saves and retrieves state', async () => {
      const { state, applied } = await saveDoorState(mockEnv, 'garage-left', 'OPEN', {
        source: 'simulate',
        doorName: 'Garage Door Left',
      });
      expect(applied).toBe(true);
      expect(state.value).toBe('OPEN');
      expect(state.createdAt).toBeTruthy();

      const retrieved = await getDoorState(mockEnv, 'garage-left');
      expect(retrieved.value).toBe('OPEN');
      expect(retrieved.createdAt).toBe(state.createdAt);
    });

    it('preserves open-since across duplicate OPEN updates', async () => {
      const first = await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      const second = await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      expect(second.state.createdAt).toBe(first.state.createdAt);
      expect(second.applied).toBe(true);
    });

    it('skips duplicates when Message-ID hash already exists', async () => {
      const first = await saveDoorState(mockEnv, 'garage-left', 'OPEN', {
        messageId: '<dup@example.com>',
        source: 'email',
      });
      expect(first.duplicate).toBe(false);
      expect(first.applied).toBe(true);

      const second = await saveDoorState(mockEnv, 'garage-left', 'CLOSED', {
        messageId: '<dup@example.com>',
        source: 'email',
      });
      expect(second.duplicate).toBe(true);
      expect(second.applied).toBe(false);
      expect((await getDoorState(mockEnv, 'garage-left')).value).toBe('OPEN');
    });

    it('returns applied:false and current state when chronology rejects the write', async () => {
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      d1State.doors.get('garage-left').updated_at = '2099-01-01T00:00:00.000Z';

      const result = await saveDoorState(mockEnv, 'garage-left', 'CLOSED', {
        source: 'simulate',
      });
      expect(result.applied).toBe(false);
      expect(result.duplicate).toBe(false);
      expect(result.state.value).toBe('OPEN');
      expect((await getDoorState(mockEnv, 'garage-left')).value).toBe('OPEN');
    });
  });

  describe('getDoorHistory', () => {
    it('returns newest events first', async () => {
      await saveDoorState(mockEnv, 'garage-right', 'OPEN', { source: 'simulate' });
      await saveDoorState(mockEnv, 'garage-right', 'CLOSED', { source: 'simulate' });
      const history = await getDoorHistory(mockEnv, 'garage-right');
      expect(history.length).toBe(2);
      expect(history[0].value).toBe('CLOSED');
      expect(history[1].value).toBe('OPEN');
    });
  });

  describe('alert latch', () => {
    it('sets and reads latch; clears on non-OPEN save', async () => {
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      await setAlertLatch(mockEnv, 'garage-left', {
        openCreatedAt: '2026-01-01T00:00:00.000Z',
        lastAlertSentAt: '2026-01-01T01:00:00.000Z',
      });
      expect(await getAlertLatch(mockEnv, 'garage-left')).toEqual({
        openCreatedAt: '2026-01-01T00:00:00.000Z',
        lastAlertSentAt: '2026-01-01T01:00:00.000Z',
      });

      await saveDoorState(mockEnv, 'garage-left', 'CLOSED', { source: 'simulate' });
      expect(await getAlertLatch(mockEnv, 'garage-left')).toBeNull();
    });

    it('does not clear OPEN latch on duplicate CLOSED Message-ID', async () => {
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', {
        messageId: '<open@example.com>',
        source: 'email',
      });
      await setAlertLatch(mockEnv, 'garage-left', {
        openCreatedAt: '2026-01-01T00:00:00.000Z',
        lastAlertSentAt: '2026-01-01T01:00:00.000Z',
      });

      const duplicate = await saveDoorState(mockEnv, 'garage-left', 'CLOSED', {
        messageId: '<open@example.com>',
        source: 'email',
      });
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.applied).toBe(false);
      expect(await getAlertLatch(mockEnv, 'garage-left')).toEqual({
        openCreatedAt: '2026-01-01T00:00:00.000Z',
        lastAlertSentAt: '2026-01-01T01:00:00.000Z',
      });
    });

    it('does not clear OPEN latch when chronology rejects CLOSED', async () => {
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      await setAlertLatch(mockEnv, 'garage-left', {
        openCreatedAt: '2026-01-01T00:00:00.000Z',
        lastAlertSentAt: '2026-01-01T01:00:00.000Z',
      });
      d1State.doors.get('garage-left').updated_at = '2099-01-01T00:00:00.000Z';

      const rejected = await saveDoorState(mockEnv, 'garage-left', 'CLOSED', {
        source: 'simulate',
      });
      expect(rejected.applied).toBe(false);
      expect(rejected.state.value).toBe('OPEN');
      expect(await getAlertLatch(mockEnv, 'garage-left')).toEqual({
        openCreatedAt: '2026-01-01T00:00:00.000Z',
        lastAlertSentAt: '2026-01-01T01:00:00.000Z',
      });
    });
  });

  describe('pruneOldEvents', () => {
    it('deletes events older than retention', async () => {
      await saveDoorState(mockEnv, 'garage-left', 'OPEN', { source: 'simulate' });
      const deleted = await pruneOldEvents(mockEnv, Date.parse('2099-01-01T00:00:00.000Z'));
      expect(deleted).toBeGreaterThan(0);
      expect(await getDoorHistory(mockEnv, 'garage-left')).toEqual([]);
    });
  });
});
