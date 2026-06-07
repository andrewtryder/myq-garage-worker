import { Env, DoorState } from './types';

export async function saveDoorState(env: Env, feedKey: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  const newState: DoorState = {
    value,
    createdAt: now,
  };

  // 1. Save latest state
  await env.GARAGE_STATE.put(feedKey, JSON.stringify(newState));

  // 2. Fetch, update and save history log (capped to last 20 entries)
  try {
    const historyKey = `history:${feedKey}`;
    const history = await getDoorHistory(env, feedKey);
    history.unshift(newState); // prepend new state
    const cappedHistory = history.slice(0, 20); // cap to 20
    await env.GARAGE_STATE.put(historyKey, JSON.stringify(cappedHistory));
  } catch (err) {
    console.error(`Failed to update state history for ${feedKey}:`, err);
  }

  console.log(`Saved state to KV for ${feedKey}: ${value}`);
}

export async function getDoorState(env: Env, feedKey: string): Promise<DoorState> {
  try {
    const raw = await env.GARAGE_STATE.get(feedKey);
    if (!raw) {
      return { value: 'UNKNOWN', createdAt: '' };
    }
    const parsed = JSON.parse(raw) as Partial<DoorState>;
    return {
      value: parsed.value || 'UNKNOWN',
      createdAt: parsed.createdAt || '',
    };
  } catch (err) {
    console.error(`Error reading KV for ${feedKey}:`, err);
    return { value: 'UNKNOWN', createdAt: '' };
  }
}

export async function getDoorHistory(env: Env, feedKey: string): Promise<DoorState[]> {
  try {
    const raw = await env.GARAGE_STATE.get(`history:${feedKey}`);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item: Partial<DoorState>) => ({
        value: item.value || 'UNKNOWN',
        createdAt: item.createdAt || '',
      }));
    }
    return [];
  } catch (err) {
    console.error(`Error reading history KV for ${feedKey}:`, err);
    return [];
  }
}
