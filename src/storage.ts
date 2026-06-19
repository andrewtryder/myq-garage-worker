import { Env, DoorState } from './types';

export async function saveDoorState(env: Env, doorKey: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  const newState: DoorState = {
    value,
    createdAt: now,
  };

  // 1. Save latest state
  await env.GARAGE_STATE.put(doorKey, JSON.stringify(newState));

  // 2. Fetch, update and save history log (capped to last 20 entries)
  try {
    const historyKey = `history:${doorKey}`;
    const history = await getDoorHistory(env, doorKey);
    history.unshift(newState); // prepend new state
    const cappedHistory = history.slice(0, 20); // cap to 20
    await env.GARAGE_STATE.put(historyKey, JSON.stringify(cappedHistory));
  } catch (err) {
    console.error(`Failed to update state history for ${doorKey}:`, err);
  }

  console.log(`Saved state to KV for ${doorKey}: ${value}`);
}

export async function getDoorState(env: Env, doorKey: string): Promise<DoorState> {
  try {
    const raw = await env.GARAGE_STATE.get(doorKey);
    if (!raw) {
      return { value: 'UNKNOWN', createdAt: '' };
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const state = parsed as Record<string, unknown>;
      return {
        value: typeof state.value === 'string' ? state.value : 'UNKNOWN',
        createdAt: typeof state.createdAt === 'string' ? state.createdAt : '',
      };
    }
    return { value: 'UNKNOWN', createdAt: '' };
  } catch (err) {
    console.error(`Error reading KV for ${doorKey}:`, err);
    return { value: 'UNKNOWN', createdAt: '' };
  }
}

export async function getDoorHistory(env: Env, doorKey: string): Promise<DoorState[]> {
  try {
    const raw = await env.GARAGE_STATE.get(`history:${doorKey}`);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const state = item as Record<string, unknown>;
          return {
            value: typeof state.value === 'string' ? state.value : 'UNKNOWN',
            createdAt: typeof state.createdAt === 'string' ? state.createdAt : '',
          };
        }
        return { value: 'UNKNOWN', createdAt: '' };
      });
    }
    return [];
  } catch (err) {
    console.error(`Error reading history KV for ${doorKey}:`, err);
    return [];
  }
}
